import { Injectable, Logger } from '@nestjs/common';
import { INDEXER_API } from '../common/constants/app.constant';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { InjectSchedule, Schedule } from 'nest-schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService, ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import * as util from 'util';

@Injectable()
export class SyncSmartContractService {
  private readonly logger = new Logger(SyncSmartContractService.name);
  private indexerUrl = '';
  private indexerChainId = '';
  private contractNextKey = '';
  private contractLimit = 50;
  private contractOffset = 0;
  private syncData = false;
  private fromHeight = 0;
  private toHeight = 0;

  constructor(
    private configService: ConfigService,
    private _commonUtil: CommonUtil,
    @InjectSchedule() private readonly schedule: Schedule,
    @InjectQueue('smart-contracts') private readonly contractQueue: Queue,
  ) {
    this.logger.log(
      '============== Constructor Sync Smart Contract Service ==============',
    );
    this.indexerUrl = this.configService.get('INDEXER_URL');
    this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');
    const config = ENV_CONFIG.SYNC_SMART_CONTRACT;
    this.syncData = config.SYNC_DATA;
    this.fromHeight = config.FROM_HEIGHT;
    this.toHeight = config.TO_HEIGHT;
  }

  /***
   * Create queue sync contract
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async syncSmartContractFromHeight() {
    this.logger.log(`${this.syncSmartContractFromHeight.name} was called!`);

    if (this.syncData) {
      try {
        // Get data from Indexer(heroscope)
        this.logger.log(
          `${this.syncSmartContractFromHeight.name} call smart-contracts api to get data!`,
        );
        const responses = await this.getContractFromIndexer(
          this.contractLimit,
          this.contractOffset,
          this.fromHeight,
          this.toHeight,
        );
        const smartContracts = responses?.smart_contracts;
        if (smartContracts.length > 0) {
          // Push data to queue
          this.pushDataToQueue(smartContracts);
          this.contractNextKey = responses?.next_key;
          if (this.contractNextKey?.length > 0) {
            this.contractOffset =
              (this.contractOffset + 1) * this.contractLimit;
          } else {
            this.syncData = false;
          }
        }
      } catch (err) {
        this.logger.error(
          `${this.syncSmartContractFromHeight.name} was called error: ${err.stack}`,
        );
      }
    }
  }

  /**
   * Push data to queue
   * @param data
   */
  pushDataToQueue(data: any) {
    this.contractQueue.add('sync-contract-from-height', data, {
      removeOnComplete: true,
      backoff: {
        delay: 10000,
        type: 'fixed',
      },
    });
  }

  /**
   * Get data from Indexer(Heroscope)
   * @param limit
   * @param offset
   * @param fromHeight
   * @param toHeight
   * @returns
   */
  async getContractFromIndexer(
    limit: number,
    offset: number,
    fromHeight: number,
    toHeight: number,
  ) {
    const urlRequest = `${this.indexerUrl}${util.format(
      INDEXER_API.GET_SMART_CONTRACTS,
      this.indexerChainId,
      limit,
      offset,
    )}&fromHeight=${fromHeight}&toHeight=${toHeight}`;

    const responses = await this._commonUtil.getDataAPI(urlRequest, '');
    return responses?.data;
  }
}
