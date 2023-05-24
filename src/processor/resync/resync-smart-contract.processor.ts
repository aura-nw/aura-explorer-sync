//FIXME: delete this file when admin panel release this feature.
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { CronExpression } from '@nestjs/schedule';
import { Queue } from 'bull';
import {
  CONTRACT_CODE_STATUS,
  CONTRACT_TYPE,
  INDEXER_API,
  QUEUES,
} from 'src/common/constants/app.constant';
import { SyncDataHelpers } from 'src/helpers/sync-data.helpers';
import { SmartContractRepository } from 'src/repositories/smart-contract.repository';
import { TokenMarketsRepository } from 'src/repositories/token-markets.repository';
import { ConfigService, ENV_CONFIG } from 'src/shared/services/config.service';
import { CommonUtil } from 'src/utils/common.util';
import { In } from 'typeorm';
import * as util from 'util';
import { BaseProcessor } from '../base.processor';

@Processor(QUEUES.RESYNC.CONTRACT.QUEUE_NAME)
export class ReSyncSmartContractProcessor extends BaseProcessor {
  private indexerUrl = '';
  private indexerChainId = '';
  private contractNextKey = '';
  private contractLimit = 50;
  private contractOffset = 0;
  private syncData = false;
  private fromHeight = 0;
  private toHeight = 0;
  private totalContract = 0;
  constructor(
    private configService: ConfigService,
    private _commonUtil: CommonUtil,
    private tokenMarketsRepository: TokenMarketsRepository,
    private smartContractRepository: SmartContractRepository,

    @InjectQueue(QUEUES.RESYNC.CONTRACT.QUEUE_NAME)
    private readonly resyncContractQueue: Queue,
  ) {
    super();

    this.indexerUrl = this.configService.get('INDEXER_URL');
    this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');
    const config = ENV_CONFIG.SYNC_SMART_CONTRACT;
    this.syncData = config.SYNC_DATA;
    this.fromHeight = config.FROM_HEIGHT;
    this.toHeight = config.TO_HEIGHT;

    this.resyncContractQueue.add(
      QUEUES.RESYNC.CONTRACT.JOBS.RESYNC_CONTRACT_FROM_HEIGHT,
      {},
      { removeOnFail: false, repeat: { cron: CronExpression.EVERY_YEAR } },
    );
  }

  @Process(QUEUES.RESYNC.CONTRACT.JOBS.RESYNC_CONTRACT_FROM_HEIGHT)
  async resyncContractFromHeight() {
    this.logger.log(`${this.resyncContractFromHeight.name} was called!`);

    if (this.syncData) {
      try {
        const responses = await this.getContractFromIndexer(
          this.contractLimit,
          this.fromHeight,
          this.toHeight,
          this.contractNextKey,
        );
        const smartContracts = responses?.smart_contracts;
        if (smartContracts.length > 0) {
          this.totalContract += smartContracts.length;
          try {
            const contracts = [];
            const tokenMarkets = [];
            const smartContractCodes = [];
            let tokenMarketInfos = [];
            let contractAddresses = [];
            if (smartContracts?.length > 0) {
              contractAddresses = smartContracts.map((m) => m.contract_address);
              tokenMarketInfos = await this.tokenMarketsRepository.find({
                where: {
                  contract_address: In(contractAddresses),
                },
              });
            }
            for (let i = 0; i < smartContracts.length; i++) {
              const data = smartContracts[i];
              const contract =
                SyncDataHelpers.makeInstantiateContractData(data);

              // Create smart contract code data
              if (
                data?.contract_type?.status !== CONTRACT_CODE_STATUS.NOT_FOUND
              ) {
                const smartContractCode =
                  SyncDataHelpers.makeSmartContractCode(data);
                smartContractCodes.push(smartContractCode);
              }

              // Create token martket data
              if (
                data?.contract_type?.status ===
                  CONTRACT_CODE_STATUS.COMPLETED &&
                data?.contract_type?.type === CONTRACT_TYPE.CW20
              ) {
                const tokenInfo = tokenMarketInfos.find(
                  (f) => f.contract_address === data.contract_address,
                );
                if (!tokenInfo) {
                  const tokenMarket = SyncDataHelpers.makeTokenMarket(contract);
                  tokenMarkets.push(tokenMarket);
                }
              }

              contracts.push(contract);
            }

            // Insert Data smart contract
            if (contracts.length > 0) {
              await this.smartContractRepository.insertOnDuplicate(contracts, [
                'id',
              ]);
            }

            // Insert data token markets
            if (tokenMarkets.length > 0) {
              await this.tokenMarketsRepository.insertOnDuplicate(
                tokenMarkets,
                ['id'],
              );
            }
          } catch (err) {
            this.logger.error(
              `${this.resyncContractFromHeight.name} was called error: ${err.stack}`,
            );
            throw err;
          }
          this.contractNextKey = responses?.next_key;
          if (this.contractNextKey?.length > 0) {
            this.contractOffset =
              (this.contractOffset + 1) * this.contractLimit;
          } else {
            this.syncData = false;
            this.contractOffset = 0;
          }
        }
        this.logger.log(`Total contract is: ${this.totalContract}`);
      } catch (err) {
        this.logger.error(
          `${this.resyncContractFromHeight.name} was called error: ${err.stack}`,
        );
      }
    }
  }

  async getContractFromIndexer(
    limit: number,
    fromHeight: number,
    toHeight: number,
    nextKey = null,
  ) {
    let urlRequest = '';
    if (nextKey && nextKey?.length > 0) {
      urlRequest = `${this.indexerUrl}${util.format(
        INDEXER_API.GET_SMART_CONTRACT_BY_NEXT_KEY,
        this.indexerChainId,
        limit,
        nextKey,
      )}`;
    } else {
      urlRequest = `${this.indexerUrl}${util.format(
        INDEXER_API.GET_SMART_CONTRACTS,
        this.indexerChainId,
        limit,
        fromHeight,
        toHeight,
      )}`;
    }
    const responses = await this._commonUtil.getDataAPI(urlRequest, '');
    return responses?.data;
  }
}
