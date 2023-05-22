import {
  InjectQueue,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueError,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { Job, Queue } from 'bull';
import {
  COINGECKO_API,
  COIN_MARKET_CAP_API,
  QUEUES,
  REDIS_KEY,
  SYNC_COIN_INF_HOSTS,
} from 'src/common/constants/app.constant';
import { TokenMarkets } from 'src/entities';
import { SyncDataHelpers } from 'src/helpers/sync-data.helpers';
import { TokenMarketsRepository } from 'src/repositories/token-markets.repository';
import { ENV_CONFIG } from 'src/shared/services/config.service';
import { CommonUtil } from 'src/utils/common.util';
import { InfluxDBClient } from 'src/utils/influxdb-client';
import { RedisUtil } from 'src/utils/redis.util';
import { Equal, In } from 'typeorm';
import * as util from 'util';

@Processor(QUEUES.SYNC_COIN.QUEUE_NAME)
export class CoinProcessor {
  private readonly logger = new Logger(CoinProcessor.name);
  private influxDbClient: InfluxDBClient;

  constructor(
    private readonly commonUtil: CommonUtil,
    private readonly tokenMarketsRepository: TokenMarketsRepository,
    private readonly redisUtil: RedisUtil,
    @InjectQueue(QUEUES.SYNC_COIN.QUEUE_NAME) private readonly coinQueue: Queue,
  ) {
    this.logger.log('============== Constructor Coin Processor ==============');
    this.connectInfluxdb();

    this.coinQueue.add(
      QUEUES.SYNC_COIN.JOBS.SYNC_ID,
      {},
      {
        removeOnFail: false,
        repeat: { cron: CronExpression.EVERY_10_HOURS },
      },
    );

    this.coinQueue.add(
      QUEUES.SYNC_COIN.JOBS.SYNC_PRICE,
      {},
      {
        removeOnFail: false,
        repeat: { cron: ENV_CONFIG.PRICE_TIME_SYNC },
      },
    );
  }

  @Process(QUEUES.SYNC_COIN.JOBS.SYNC_ID)
  async syncCoin() {
    try {
      await this.redisUtil.connect();
      const coinsData = await this.commonUtil.getDataAPI(
        ENV_CONFIG.COINGECKO.API,
        COINGECKO_API.GET_COINS,
      );

      if (coinsData) {
        const platForm = ENV_CONFIG.COINGECKO.COINGEKO_PLATFORM;
        const coinsList = coinsData.filter((coin) =>
          Object.keys(coin.platforms).some((coinKey) => coinKey === platForm),
        );
        await this.redisUtil.setValue(REDIS_KEY.COINGECKO_COINS, coinsList);
      }

      const tokensNoCoinId = await this.tokenMarketsRepository.find({
        where: { coin_id: Equal('') },
      });

      const coingeckoCoins = await this.redisUtil.getValue(
        REDIS_KEY.COINGECKO_COINS,
      );
      const coinList = JSON.parse(coingeckoCoins);
      const platform = ENV_CONFIG.COINGECKO.COINGEKO_PLATFORM;
      const updatingTokens: TokenMarkets[] = tokensNoCoinId.filter((item) => {
        const coinInfo = coinList.find(
          (f) => f.platforms?.[`${platform}`] === item.contract_address,
        );
        if (coinInfo) {
          item.coin_id = coinInfo.id;
          return true;
        }
        return false;
      });

      if (updatingTokens.length > 0) {
        await this.tokenMarketsRepository.update(updatingTokens);
      }
    } catch (error) {
      throw error;
    }
  }

  @Process(QUEUES.SYNC_COIN.JOBS.SYNC_PRICE)
  async syncCW20Price() {
    const CW20Count: number =
      await this.tokenMarketsRepository.countCw20TokensHavingCoinId();
    const defaultTokens: string[] = ['aura-network', 'bitcoin'];
    const limit: number = ENV_CONFIG.COINGECKO.MAX_REQUEST;
    const totalPages: number = Math.ceil(
      (CW20Count + defaultTokens.length) / limit,
    );
    for (let page = 0; page < totalPages; page++) {
      const dataHavingCoinID =
        await this.tokenMarketsRepository.getCw20TokenMarketsHavingCoinId(
          limit,
          page,
        );
      const tokenHavingCoinID = dataHavingCoinID?.map((data) => data.coin_id);

      if (page === totalPages - 1) {
        tokenHavingCoinID.push(...defaultTokens);
      }

      try {
        if (
          ENV_CONFIG.PRICE_HOST_SYNC === SYNC_COIN_INF_HOSTS.COIN_MARKET_CAP
        ) {
          await this.syncCoinMarketCapPrice(tokenHavingCoinID);
        } else {
          await this.syncCoingeckoPrice(tokenHavingCoinID);
        }
      } catch (err) {
        // Reconnect influxDb
        const errorCode = err?.code || '';
        if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
          this.connectInfluxdb();
        }
      }
    }
  }

  async syncCoinMarketCapPrice(listTokens) {
    const coinMarketCap = ENV_CONFIG.COIN_MARKET_CAP;
    this.logger.log(`============== Call CoinMarketCap Api ==============`);
    const coinIds = ENV_CONFIG.COIN_MARKET_CAP.COIN_ID;
    const coinMarkets: TokenMarkets[] = [];

    const para = `${util.format(
      COIN_MARKET_CAP_API.GET_COINS_MARKET,
      coinIds,
    )}`;

    const headersRequest = {
      'Content-Type': 'application/json',
      'X-CMC_PRO_API_KEY': ENV_CONFIG.COIN_MARKET_CAP.API_KEY,
    };

    const [response, tokenInfos] = await Promise.all([
      this.commonUtil.getDataAPIWithHeader(
        coinMarketCap.API,
        para,
        headersRequest,
      ),
      this.tokenMarketsRepository.find({
        where: {
          coin_id: In(listTokens),
        },
      }),
    ]);

    if (response?.status?.error_code == 0 && response?.data) {
      for (const [key, value] of Object.entries(response?.data)) {
        const data = response?.data[key];
        let tokenInfo = tokenInfos?.find((f) => f.coin_id === data.slug);
        if (tokenInfo) {
          tokenInfo = SyncDataHelpers.updateCoinMarketsData(tokenInfo, data);
          coinMarkets.push(tokenInfo);
        }
      }
    }
    if (coinMarkets.length > 0) {
      await this.updateTokens(coinMarkets);
    }
  }

  async syncCoingeckoPrice(listTokens) {
    const coingecko = ENV_CONFIG.COINGECKO;
    this.logger.log(`============== Call Coingecko Api ==============`);
    const coinIds = listTokens.join(',');
    const coinMarkets: TokenMarkets[] = [];

    const para = `${util.format(
      COINGECKO_API.GET_COINS_MARKET,
      coinIds,
      coingecko.MAX_REQUEST,
    )}`;

    const [response, tokenInfos] = await Promise.all([
      this.commonUtil.getDataAPI(coingecko.API, para),
      this.tokenMarketsRepository.find({
        where: {
          coin_id: In(listTokens),
        },
      }),
    ]);

    if (response) {
      for (let index = 0; index < response.length; index++) {
        const data = response[index];
        let tokenInfo = tokenInfos?.find((f) => f.coin_id === data.id);
        if (tokenInfo) {
          tokenInfo = SyncDataHelpers.updateTokenMarketsData(tokenInfo, data);
          coinMarkets.push(tokenInfo);
        }
      }
    }
    if (coinMarkets.length > 0) {
      await this.updateTokens(coinMarkets);
    }
  }

  async updateTokens(listTokens: TokenMarkets[]) {
    await this.tokenMarketsRepository.update(listTokens);

    this.logger.log(`============== Write data to Influxdb ==============`);
    await this.influxDbClient.writeBlockTokenPriceAndVolume(listTokens);
    this.logger.log(
      `============== Write data to Influxdb  successfully ==============`,
    );
  }

  connectInfluxdb() {
    this.logger.log(
      `============== call connectInfluxdb method ==============`,
    );
    try {
      this.influxDbClient = new InfluxDBClient(
        ENV_CONFIG.INFLUX_DB.BUCKET,
        ENV_CONFIG.INFLUX_DB.ORGANIZTION,
        ENV_CONFIG.INFLUX_DB.URL,
        ENV_CONFIG.INFLUX_DB.TOKEN,
      );
      if (this.influxDbClient) {
        this.influxDbClient.initWriteApi();
      }
    } catch (err) {
      this.logger.log(
        `call connectInfluxdb method has error: ${err.message}`,
        err.stack,
      );
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Completed job ${job.id} of type ${job.name}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Error job ${job.id} of type ${job.name}`);
    this.logger.error(error.stack);
  }

  @OnQueueError()
  onErr(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}`);
    this.logger.error(error.stack);
  }
}
