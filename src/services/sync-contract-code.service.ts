import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { In } from 'typeorm';
import * as util from 'util';
import {
  CONTRACT_CODE_RESULT,
  CONTRACT_CODE_STATUS,
  CONTRACT_TYPE,
  INDEXER_API,
  NODE_API,
} from '../common/constants/app.constant';
import { SmartContract, SmartContractCode, TokenMarkets } from '../entities';
import { SmartContractCodeRepository } from '../repositories/smart-contract-code.repository';
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import { ConfigService, ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';

@Injectable()
export class SyncContractCodeService {
  private readonly _logger = new Logger(SyncContractCodeService.name);
  private indexerUrl;
  private indexerChainId;
  private isSyncContractCode = false;
  private api;
  private syncMissingContractCode = true;
  private contractNextKey = '';

  constructor(
    private configService: ConfigService,
    private _commonUtil: CommonUtil,
    private smartContractCodeRepository: SmartContractCodeRepository,
    private smartContractRepository: SmartContractRepository,
    private tokenMarketsRepository: TokenMarketsRepository,
  ) {
    this._logger.log(
      '============== Constructor Sync Contract Code Service ==============',
    );
    this.indexerUrl = this.configService.get('INDEXER_URL');
    this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');
    this.api = ENV_CONFIG.NODE.API;
  }

  @Interval(2000)
  async handleInterval() {
    // check status
    if (this.isSyncContractCode) {
      this._logger.log(null, 'already syncing contract code... wait');
      return;
    } else {
      this._logger.log(null, 'fetching data contract code...');
    }
    try {
      this.isSyncContractCode = true;
      //get contract code from db
      const contractCodeDB =
        await this.smartContractCodeRepository.findByCondition({
          result: CONTRACT_CODE_RESULT.TBD,
        });
      if (contractCodeDB && contractCodeDB.length > 0) {
        const contractCodes = [];
        for (let i = 0; i < contractCodeDB.length; i++) {
          const item: SmartContractCode = contractCodeDB[i];
          //get contract code from indexer
          const contractCodeIndexer = await this._commonUtil.getDataAPI(
            `${this.indexerUrl}${util.format(
              INDEXER_API.CHECK_STATUS_CODE_ID,
              this.indexerChainId,
              item.code_id,
            )}`,
            '',
          );
          if (
            contractCodeIndexer &&
            contractCodeIndexer?.data.status !== 'NotFound'
          ) {
            item.type = contractCodeIndexer?.data?.contractType;
            switch (contractCodeIndexer.data.status) {
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
            contractCodes.push(item);
          }
        }
        // update data
        await this.smartContractCodeRepository.update(contractCodes);
      }
      this.isSyncContractCode = false;
    } catch (error) {
      this._logger.error(
        `Sync Contract Code was error, ${error.name}: ${error.message}`,
      );
      this._logger.error(`${error.stack}`);
      this.isSyncContractCode = false;
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

  /***
   * Create queue sync contract
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async syncMissingSmartContractCode() {
    this._logger.log(`${this.syncMissingSmartContractCode.name} was called!`);
    if (this.syncMissingContractCode) {
      if (this.contractNextKey !== null) {
        this._logger.log(
          `${this.syncMissingSmartContractCode.name} call lcd smart-contracts-code api to get data!`,
        );
        this.contractNextKey = await this.syncContractCodeFromLcd(
          this.contractNextKey,
        );
      } else {
        this.syncMissingContractCode = false;
      }
    }
  }

  /**
   * Get data from Indexer(Heroscope)
   * @param nextKey
   * @returns
   */
  async syncContractCodeFromLcd(nextKey = null) {
    // Generate request URL
    const urlRequest = `${this.api}${util.format(
      NODE_API.CONTRACT_CODE,
      encodeURIComponent(nextKey),
    )}`;
    // Call lcd to get data
    const responses = await this._commonUtil.getDataAPI(urlRequest, '');

    const codeInfos = responses?.code_infos;
    if (codeInfos) {
      const codeIdTargets = codeInfos.map((m) => m.code_id);
      // Get contract code from db
      const contractCode = await this.smartContractCodeRepository.find({
        code_id: In(codeIdTargets),
      });
      const codeIdReuslts = contractCode.map((m) => m.code_id);
      // Find contract missing at DB
      const codeIdMissing = codeInfos.filter(
        (item) => !codeIdReuslts.includes(Number(item.code_id)),
      );
      const smartContractCodes = [];
      codeIdMissing.forEach((item) => {
        const smartContractCode = new SmartContractCode();
        smartContractCode.code_id = item.code_id;
        smartContractCode.creator = item.creator;
        smartContractCode.tx_hash = item.data_hash;
        smartContractCodes.push(smartContractCode);
      });
      if (smartContractCodes.length > 0) {
        try {
          // insert data
          await this.smartContractCodeRepository.insert(smartContractCodes);
        } catch (error) {
          this._logger.error(
            `Insert Contract Code was error, ${error?.code}: ${error?.stack}`,
          );
          throw error;
        }
      }
    }
    return responses?.pagination?.next_key;
  }
}
