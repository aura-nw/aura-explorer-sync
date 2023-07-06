import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bull';

import {
  COINGECKO_API,
  QUEUES,
  REDIS_KEY,
} from '../common/constants/app.constant';

import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { RedisUtil } from '../utils/redis.util';
import { Equal, In } from 'typeorm';
import { TokenMarkets } from '../entities';

@Injectable()
export class SyncTokenService {
  private readonly _logger = new Logger(SyncTokenService.name);
  private isSyncTokenIds = false;

  constructor(
    private _commonUtil: CommonUtil,
    private tokenMarketsRepository: TokenMarketsRepository,
    private redisUtil: RedisUtil,

    @InjectQueue('smart-contracts') private readonly contractQueue: Queue,
  ) {
    this._logger.log(
      '============== Constructor Sync Token Service ==============',
    );
  }

  /**
   * @todo: use for sync cw20 tokens price
   * Create thread to sync data
   */
  @Cron(ENV_CONFIG.PRICE_TIME_SYNC)
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
        const dataHavingCoinId =
          await this.tokenMarketsRepository.getCw20TokenMarketsHavingCoinId(
            limit,
            i,
          );

        const tokensHavingCoinId = dataHavingCoinId?.map((i) => i.coin_id);
        if (i === pages - 1) {
          tokensHavingCoinId.push(...defaultTokens);
        }
        if (tokensHavingCoinId.length > 0) {
          this.contractQueue.add(
            QUEUES.SYNC_PRICE_VOLUME,
            {
              listTokens: tokensHavingCoinId,
            },
            {
              removeOnComplete: true,
              removeOnFail: true,
              timeout: 10000,
            },
          );
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
  @Cron('0 */3 * * * *')
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

      // handle sync-coin-id
      const tokenNoCoinIds = await this.tokenMarketsRepository.find({
        where: { coin_id: Equal('') },
      });

      if (tokenNoCoinIds.length > 0) {
        this.contractQueue.add(
          QUEUES.SYNC_COIN_ID,
          {
            tokens: tokenNoCoinIds,
          },
          {
            removeOnComplete: true,
            removeOnFail: true,
            timeout: 10000,
          },
        );
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
}
