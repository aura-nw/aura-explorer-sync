import {
  InjectQueue,
  OnQueueError,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import {
  COINGECKO_API,
  COIN_MARKET_CAP_API,
  QUEUES,
} from '../common/constants/app.constant';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import * as util from 'util';
import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import { TokenMarkets } from 'src/entities';
import { In } from 'typeorm';
import { InfluxDBClient } from 'src/utils/influxdb-client';

@Processor(QUEUES.SYNC_COIN.QUEUE_NAME)
export class CoinProcessor {
  private readonly logger = new Logger(CoinProcessor.name);
  private influxDbClient: InfluxDBClient;

  constructor(
    private _commonUtil: CommonUtil,
    private tokenMarketsRepository: TokenMarketsRepository,
    @InjectQueue(QUEUES.SYNC_COIN.QUEUE_NAME) private readonly coinQueue: Queue,
  ) {
    this.logger.log('============== Constructor CoinProcessor ==============');
    this.connectInfluxdb();

    this.coinQueue.add(
      QUEUES.SYNC_COIN.JOBS.SYNC_PRICE,
      {},
      {
        repeat: { cron: QUEUES.SYNC_COIN.JOBS.TIME_SYNC },
      },
    );
  }

  @Process(QUEUES.SYNC_COIN.JOBS.SYNC_PRICE)
  async syncCW20TokensPrice(): Promise<void> {
    const numberCW20Tokens =
      await this.tokenMarketsRepository.countCw20TokensHavingCoinId();
    const geckoLimit = ENV_CONFIG.COINGECKO.MAX_REQUEST;
    const pages = Math.ceil(numberCW20Tokens / geckoLimit);

    for (let i = 0; i < pages; i++) {
      const dataHavingCoinId =
        await this.tokenMarketsRepository.getCw20TokenMarketsHavingCoinId(
          geckoLimit,
          i,
        );

      const tokensHavingCoinId = dataHavingCoinId?.map((i) => i.coin_id);

      if (tokensHavingCoinId.length > 0) {
        await this.handleSyncPriceVolume(tokensHavingCoinId);
      }
    }
  }

  async handleSyncPriceVolume(listTokens: string[]): Promise<void> {
    try {
      if (ENV_CONFIG.PRICE_HOST_SYNC === 'COIN_MARKET_CAP') {
        await this.syncCoinMarketCapPrice(listTokens);
      } else {
        await this.syncCoingeckoPrice(listTokens);
      }
    } catch (err) {
      //Reconnect influxDb
      const errorCode = err?.code || '';
      if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
        this.connectInfluxdb();
      }

      throw err;
    }
  }

  async syncCoinMarketCapPrice(listTokens: string[]): Promise<void> {
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
      this._commonUtil.getDataAPIWithHeader(
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      await this.tokenMarketsRepository.update(coinMarkets);

      this.logger.log(`============== Write data to Influxdb ==============`);
      await this.influxDbClient.writeBlockTokenPriceAndVolume(coinMarkets);
      this.logger.log(
        `============== Write data to Influxdb  successfully ==============`,
      );
    }
  }

  async syncCoingeckoPrice(listTokens: string[]): Promise<void> {
    const coingecko = ENV_CONFIG.COINGECKO;
    this.logger.log(`============== Call Coingecko Api ==============`);
    const coinIds = listTokens.join(',');
    let coinMarkets: TokenMarkets[] = [];
    const geckoParam = `${util.format(
      COINGECKO_API.GET_COINS_MARKET,
      coinIds,
      coingecko.MAX_REQUEST,
    )}`;

    const [coinsResponse, coinsInDB] = await Promise.all([
      this._commonUtil.getDataAPI(coingecko.API, geckoParam),
      this.tokenMarketsRepository.find({
        where: {
          coin_id: In(listTokens),
        },
      }),
    ]);

    if (coinsResponse) {
      coinMarkets = coinsResponse.map((coinResponse) => {
        const newCoinInfo = coinsInDB.find(
          (coinInDB) => coinInDB.coin_id === coinResponse.id,
        );

        if (newCoinInfo) {
          return SyncDataHelpers.updateTokenMarketsData(
            newCoinInfo,
            coinResponse,
          );
        }
      });
    }
    if (coinMarkets.length > 0) {
      await this.tokenMarketsRepository.update(coinMarkets);

      this.logger.log(`============== Write data to Influxdb ==============`);
      await this.influxDbClient.writeBlockTokenPriceAndVolume(coinMarkets);
      this.logger.log(
        `============== Write data to Influxdb  successfully ==============`,
      );
    }
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

  @OnQueueError()
  async onError(error: Error) {
    this.logger.error(`Queue Error: ${error.stack}`);
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}`);
    this.logger.error(`Error: ${error}`);
  }
}
