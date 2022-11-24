import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { Queue } from 'bull';

import {
  COINGECKO_API,
  CONTRACT_CODE_RESULT,
  CONTRACT_TYPE,
  REDIS_KEY,
} from '../common/constants/app.constant';

import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';

import { RedisUtil } from '../utils/redis.util';

@Injectable()
export class SyncTokenService {
  private readonly _logger = new Logger(SyncTokenService.name);
  private isSyncTokenIds = false;
  private isTokenContract = false;

  constructor(
    private _commonUtil: CommonUtil,
    private tokenMarketsRepository: TokenMarketsRepository,
    private redisUtil: RedisUtil,
    private smartContractRepository: SmartContractRepository,

    @InjectQueue('smart-contracts') private readonly contractQueue: Queue,
  ) {
    this._logger.log(
      '============== Constructor Sync Token Service ==============',
    );

    // // Call method when init app
    (async () => {
      await this.syncTokenIds();
      await this.syncCW20TokensPrice();
    })();
  }

  @Interval(10000)
  async syncTokenContract() {
    // check status
    if (this.isTokenContract) {
      this._logger.log(null, 'already syncing tokens... waitting');
      return;
    } else {
      this._logger.log(null, 'fetching data tokens...');
    }
    try {
      this.isTokenContract = true;
      const contractCodes =
        await this.smartContractRepository.getContractCodeByStatus(CONTRACT_CODE_RESULT.CORRECT);

      if (contractCodes.length > 0) {

        //Add queue CW20
        this.addContractToQueue(contractCodes, CONTRACT_TYPE.CW20);

        //Add queue CW721
        this.addContractToQueue(contractCodes, CONTRACT_TYPE.CW721);

        //Add queue CW4973
        this.addContractToQueue(contractCodes, CONTRACT_TYPE.CW4973);
      }

      this.isTokenContract = false;
    } catch (error) {
      this._logger.error(
        `Sync cw20 tokens was error, ${error.name}: ${error.message}`,
      );
      this._logger.error(`${error.stack}`);
      this.isTokenContract = false;
      throw error;
    }
  }

  /**
   * @todo: use for sync cw20 tokens price
   * Create thread to sync data
   */
  @Cron('0 */2 * * * *')
  async syncCW20TokensPrice() {
    const numberCW20Tokens =
      await this.tokenMarketsRepository.countCw20TokensHavingCoinId();
    const defaultTokens: string[] = ['aura-network', 'bitcoin'];
    const countData = numberCW20Tokens + defaultTokens.length;

    const limit = ENV_CONFIG.COINGECKO.MAX_REQUEST;
    const pages = Math.ceil((countData + defaultTokens.length) / limit);
    for (let i = 0; i < pages; i++) {
      this._logger.log(`============== Create threads ==============`);

      try {
        // Get data CW20 by paging
        const dataPage =
          await this.tokenMarketsRepository.getCw20TokenMarketsHavingCoinId(
            limit,
            i,
          );

        const tokens = dataPage?.map((i) => i.coin_id);

        if (i === pages - 1) {
          tokens.push(...defaultTokens);
        }
        if (tokens.length > 0) {
          this.contractQueue.add('sync-price-volume', {
            listTokens: tokens,
          });
        }
      } catch (err) {
        this._logger.log(
          `${SyncTokenService.name} call createThread method has error: ${err.message}`,
          err.stack,
        );
      }
    }
  }

  // @todo: use for sync cw20 token ids into redis
  @Cron('0 */2 * * * *')
  async syncTokenIds() {
    if (this.isSyncTokenIds) {
      this._logger.log(null, 'already syncing token ids... wait');
      return;
    } else {
      this._logger.log(null, 'fetching data tokens ids...');
    }
    try {
      this.isSyncTokenIds = true;
      //connect redis
      await this.redisUtil.connect();
      const coingecko = ENV_CONFIG.COINGECKO;
      this._logger.log(`============== Call Coingecko Api ==============`);

      const response = await this._commonUtil.getDataAPI(
        coingecko.API,
        COINGECKO_API.GET_COINS,
      );

      if (response) {
        const platform = ENV_CONFIG.COINGECKO.COINGEKO_PLATFORM;
        const list = response.filter((item) =>
          Object.keys(item.platforms).some((p) => p === platform),
        );
        await this.redisUtil.setValue(REDIS_KEY.COINGECKO_COINS, list);
      }

      this.isSyncTokenIds = false;
    } catch (error) {
      this._logger.error(
        `Sync token ids was error, ${error.name}: ${error.message}`,
      );
      this._logger.error(`${error.stack}`);
      this.isSyncTokenIds = false;
      throw error;
    }
  }

  /**
   * Add contract to queue
   * @param data 
   * @param type 
   */
  addContractToQueue(data: Array<any>, type: CONTRACT_TYPE) {
    const tokens = data?.filter(f => f.type === type);
    if (tokens?.length > 0) {
      let lstAddress = tokens?.map(m => m.contract_address);
      this.contractQueue.add('sync-token', {
        lstAddress,
        type,
      }, {
        removeOnComplete: true,
        removeOnFail: true
      });
    }
  }
}
