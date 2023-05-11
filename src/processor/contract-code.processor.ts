import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common/services/logger.service';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { SmartContractCodeRepository } from '../repositories/smart-contract-code.repository';
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import {
  CONTRACT_CODE_RESULT,
  CONTRACT_CODE_STATUS,
  CONTRACT_TYPE,
  INDEXER_V2_API,
  QUEUES,
  SMART_CONTRACT_VERIFICATION,
} from '../common/constants/app.constant';
import { In } from 'typeorm';
import { SmartContract, TokenMarkets } from '../entities';
import * as util from 'util';
import { Queue } from 'bull';
import { CronExpression } from '@nestjs/schedule';

@Processor('contract-code')
export class ContractCodeProcessor {
  private readonly logger = new Logger(ContractCodeProcessor.name);
  private isSyncContractCodeResult = false;
  private isSyncContractCode = false;

  constructor(
    private commonUtil: CommonUtil,
    private smartContractCodeRepository: SmartContractCodeRepository,
    private smartContractRepository: SmartContractRepository,
    private tokenMarketsRepository: TokenMarketsRepository,
    @InjectQueue('contract-code') private readonly contractCodeQueue: Queue,
  ) {
    this.logger.log(
      '============== Constructor Sync Contract Code Service ==============',
    );
    this.contractCodeQueue.add(
      QUEUES.SYNC_CONTRACT_CODE_RESULT,
      {},
      {
        removeOnFail: false,
        repeat: { cron: CronExpression.EVERY_5_SECONDS },
      },
    );

    this.contractCodeQueue.add(
      QUEUES.SYNC_CONTRACT_CODE,
      {},
      {
        removeOnFail: false,
        repeat: { cron: CronExpression.EVERY_5_SECONDS },
      },
    );
  }

  @Process(QUEUES.SYNC_CONTRACT_CODE)
  async syncContractCode(job) {
    this.logger.log(
      `${this.syncContractCode.name} is processing job: ${job.id}`,
    );
    // check status
    if (this.isSyncContractCode) {
      this.logger.log(null, 'already syncing contract code... wait');
      return;
    } else {
      this.logger.log(null, 'fetching data contract code...');
    }
    try {
      const lastContractCode = await this.smartContractCodeRepository.findOne({
        order: { code_id: 'DESC' },
      });
      this.isSyncContractCode = true;
      if (!!lastContractCode) {
        const attributes = `code_id
        store_hash
        data_hash
        creator
        created_at
        `;

        const graphqlQuery = {
          query: util.format(
            INDEXER_V2_API.GRAPH_QL.CONTRACT_CODE_BY_CODE_ID,
            attributes,
          ),
          variables: {
            code_id: lastContractCode.code_id,
          },
        };

        const contractCodeData = (
          await this.commonUtil.fetchDataFromGraphQL(
            ENV_CONFIG.INDEXER_V2.GRAPH_QL,
            'POST',
            graphqlQuery,
          )
        ).data[ENV_CONFIG.INDEXER_V2.CHAIN_DB]['code'];

        if (contractCodeData?.length > 0) {
          const contractCodes = [];
          for await (const element of contractCodeData) {
            const contractCode: any = {
              code_id: element.code_id,
              creator: element.creator,
              tx_hash: element.store_hash,
              contract_hash: element.data_hash,
              created_at: element.element,
            };
            // sync contract code verification info with same data hash
            if (element.data_hash) {
              const matchContract =
                await this.smartContractCodeRepository.findOne({
                  contract_hash: element.data_hash.toLowerCase(),
                });
              if (
                !!matchContract &&
                matchContract.contract_verification ===
                  SMART_CONTRACT_VERIFICATION.VERIFIED
              ) {
                contractCode.contract_verification =
                  matchContract.contract_verification;
                contractCode.compiler_version = matchContract.compiler_version;
                contractCode.execute_msg_schema =
                  matchContract.execute_msg_schema;
                contractCode.instantiate_msg_schema =
                  matchContract.instantiate_msg_schema;
                contractCode.query_msg_schema = matchContract.query_msg_schema;
                contractCode.s3_location = matchContract.s3_location;
                contractCode.verified_at = new Date();
                contractCode.url = matchContract.url;
              }
            }
            contractCodes.push(contractCode);
          }

          // Create or update smart contract
          if (contractCodes.length > 0) {
            await this.smartContractCodeRepository.insertOnDuplicate(
              contractCodes,
              ['id'],
            );
          }
          this.isSyncContractCode = false;
        }
      }
    } catch (error) {
      this.logger.error(
        `Sync Contract Code was error, ${error.name}: ${error.message}`,
      );
      this.logger.error(`${error.stack}`);
      this.isSyncContractCode = false;
      throw error;
    }
  }

  @Process(QUEUES.SYNC_CONTRACT_CODE_RESULT)
  async syncContractCodeResult(job) {
    this.logger.log(
      `${this.syncContractCodeResult.name} is processing job: ${job.id}`,
    );
    // check status
    if (this.isSyncContractCodeResult) {
      this.logger.log(null, 'already syncing contract code result... wait');
      return;
    } else {
      this.logger.log(null, 'fetching data contract code result...');
    }
    try {
      this.isSyncContractCodeResult = true;
      //get contract code from db
      const contractCodeDB =
        await this.smartContractCodeRepository.findByCondition({
          result: CONTRACT_CODE_RESULT.TBD,
        });
      if (contractCodeDB && contractCodeDB.length > 0) {
        const contractCodes = [];
        const codeIds = contractCodeDB.map((item) => item.code_id);
        //get list validator
        const attributes = `code_id
        status
        type`;

        const graphqlQuery = {
          query: util.format(
            INDEXER_V2_API.GRAPH_QL.CONTRACT_CODE_RESULT,
            attributes,
          ),
          variables: {
            code_id: codeIds,
          },
        };

        const contractCodeData = (
          await this.commonUtil.fetchDataFromGraphQL(
            ENV_CONFIG.INDEXER_V2.GRAPH_QL,
            'POST',
            graphqlQuery,
          )
        ).data[ENV_CONFIG.INDEXER_V2.CHAIN_DB]['code'];

        for await (const element of contractCodeData) {
          if (element.status && element.status !== 'NotFound') {
            const item = contractCodeDB.find(
              (i) => (i.code_id = element.code_id),
            );
            if (item) {
              item.type = element.type;
              switch (element.status) {
                case CONTRACT_CODE_STATUS.COMPLETED:
                  item.result = CONTRACT_CODE_RESULT.CORRECT;
                  // Update data for token makets table
                  if (item.type === CONTRACT_TYPE.CW20) {
                    await this.updateTokenMarkets(item.code_id);
                  }
                  break;
                case CONTRACT_CODE_STATUS.REJECTED:
                  item.result = CONTRACT_CODE_RESULT.INCORRECT;
                  break;
                default:
                  item.result = CONTRACT_CODE_RESULT.TBD;
              }
              contractCodes.push({
                id: item.id,
                type: item.type,
                result: item.result,
              });
            }
          }
        }
        // update data
        await this.smartContractCodeRepository.update(contractCodes);
      }
      this.isSyncContractCodeResult = false;
    } catch (error) {
      this.logger.error(
        `Sync Contract Code result was error, ${error.name}: ${error.message}`,
      );
      this.logger.error(`${error.stack}`);
      this.isSyncContractCodeResult = false;
      throw error;
    }
  }

  /**
   * Update token market from contract
   * @param codeId
   * @param contractType
   */
  async updateTokenMarkets(codeId: number) {
    const constracts = await this.smartContractRepository.find({
      where: { code_id: codeId },
    });
    if (constracts && constracts.length > 0) {
      const addresses = constracts.map((m) => m.contract_address);
      const tokenMarkets = await this.tokenMarketsRepository.find({
        where: { contract_address: In(addresses) },
      });
      for (let i = 0; i < constracts.length; i++) {
        const item: SmartContract = constracts[i];
        let tokenInfo = new TokenMarkets();
        if (tokenMarkets.length > 0) {
          tokenInfo =
            tokenMarkets.find(
              (m) => m.contract_address === item.contract_address,
            ) || new TokenMarkets();
        }
        tokenInfo.coin_id = tokenInfo?.coin_id || '';
        tokenInfo.contract_address = item.contract_address;
        tokenInfo.name = item.token_name || '';
        tokenInfo.symbol = item.token_symbol || '';
        tokenInfo.code_id = item.code_id;
        if (item.image) {
          tokenInfo.image = item.image;
        }
        tokenInfo.description = item.description || '';
        tokenMarkets.push(tokenInfo);
      }
      if (tokenMarkets.length > 0) {
        await this.tokenMarketsRepository.update(tokenMarkets);
      }
    }
  }
}
