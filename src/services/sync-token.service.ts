import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bull';

import {
  COINGECKO_API,
  QUEUES,
  QUEUES_PROCESSOR,
  QUEUES_STATUS,
  REDIS_KEY,
} from '../common/constants/app.constant';

import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { RedisUtil } from '../utils/redis.util';
import { Equal, In } from 'typeorm';
import { TokenMarkets } from '../entities';
import { QueueInfoRepository } from '../repositories/queue-info.repository';

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
    private queueInfoRepository: QueueInfoRepository,

    @InjectQueue('smart-contracts') private readonly contractQueue: Queue,
  ) {
    this._logger.log(
      '============== Constructor Sync Token Service ==============',
    );

    // Call method when init app
    (async () => {
      await this.syncTokenIds();
      await this.syncCW20TokensPrice();
      await this.syncCW20Token();
    })();
  }

  /**
   * @todo: use for sync cw20 tokens price
   * Create thread to sync data
   */
  @Cron('0 */3 * * * *')
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
          const job = await this.contractQueue.add(
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
          this.pushDataToQueueInfo(
            {
              listTokens: tokensHavingCoinId,
            },
            job,
            QUEUES_PROCESSOR.SMART_CONTRACTS,
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
        const job = await this.contractQueue.add(
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
        this.pushDataToQueueInfo(
          {
            tokens: tokenNoCoinIds,
          },
          job,
          QUEUES_PROCESSOR.SMART_CONTRACTS,
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

  async syncCW20Token() {
    this._logger.log(null, 'syncCW20Token start...');
    try {
      const cw20Info = await this.smartContractRepository.getCW20Info();
      const listAddress = cw20Info.map((i) => i.contract_address);
      const tokens = await this.tokenMarketsRepository.find({
        where: { contract_address: In(listAddress) },
      });
      const insetingTokens: TokenMarkets[] = [];
      cw20Info.forEach((item) => {
        const existing = tokens.find(
          (f) => f.contract_address === item.contract_address,
        );
        if (!existing) {
          const tokenInfo = new TokenMarkets();
          tokenInfo.coin_id = '';
          tokenInfo.code_id = item.code_id;
          tokenInfo.contract_address = item.contract_address;
          tokenInfo.name = item.token_name || '';
          tokenInfo.symbol = item.token_symbol || '';
          tokenInfo.description = item.description || '';
          tokenInfo.image = item.image || '';
          insetingTokens.push(tokenInfo);
        }
      });
      if (insetingTokens.length > 0) {
        await this.tokenMarketsRepository.update(insetingTokens);
      }
    } catch (error) {
      this._logger.error(
        `syncCW20Token was error, ${error.name}: ${error.message}`,
      );
      this._logger.error(`${error.stack}`);

      throw error;
    }
  }

  /**
   * Push data to queue
   * @param data
   * @param job
   * @param processor
   */
  async pushDataToQueueInfo(data, job, processor) {
    const queueInfo = {
      job_id: job?.id,
      height: data?.height,
      job_data: JSON.stringify(data),
      job_name: job?.name,
      status: QUEUES_STATUS.PENDING,
      processor: processor,
    };
    await this.queueInfoRepository.insert(queueInfo);
  }
}
