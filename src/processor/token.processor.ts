import { InjectQueue, Process, Processor } from '@nestjs/bull';
import {
  COINGECKO_API,
  COIN_MARKET_CAP_API,
  GECKOTERMINAL_API,
  PROCESSOR,
  QUEUES,
} from '../common/constants/app.constant';
import { Logger } from '@nestjs/common/services/logger.service';
import { CommonUtil } from '../utils/common.util';
import { ENV_CONFIG } from '../shared/services/config.service';
import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import { Queue } from 'bull';
import * as util from 'util';
import { TokenMarkets } from '../entities';
import { InfluxDBClient } from '../utils/influxdb-client';
import { In } from 'typeorm';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';

@Processor(PROCESSOR.TOKEN_PRICE)
export class TokenProcessor {
  private readonly logger = new Logger(TokenProcessor.name);
  private influxDbClient: InfluxDBClient;

  constructor(
    private _commonUtil: CommonUtil,
    private tokenMarketsRepository: TokenMarketsRepository,
    @InjectQueue(PROCESSOR.TOKEN_PRICE) private readonly tokenQueue: Queue,
  ) {
    this.logger.log(
      '============== Constructor Token Price Processor Service ==============',
    );

    this.tokenQueue.add(
      QUEUES.SYNC_TOKEN_PRICE,
      {},
      {
        repeat: { cron: ENV_CONFIG.PRICE_TIME_SYNC },
      },
    );

    this.tokenQueue.add(
      QUEUES.SYNC_CW20_PRICE,
      {},
      {
        repeat: { cron: ENV_CONFIG.PRICE_TIME_SYNC },
      },
    );

    // Connect influxdb
    this.connectInfluxdb();
  }

  @Process(QUEUES.SYNC_TOKEN_PRICE)
  async syncAuraTokenPrice(): Promise<void> {
    try {
      const geckoTerminal = ENV_CONFIG.GECKOTERMINAL;

      const token = await this.tokenMarketsRepository.findOne({
        where: {
          coin_id: 'aura-network',
        },
      });

      const para = `${util.format(
        GECKOTERMINAL_API.GET_TOKEN_PRICE,
        ENV_CONFIG.GECKOTERMINAL.PLATFORM,
        ENV_CONFIG.GECKOTERMINAL.COIN_ADDRESS,
      )}`;

      const response = await this._commonUtil.getDataAPI(
        geckoTerminal.API,
        para,
      );
      if (response?.data?.attributes && token) {
        const attributes = response.data.attributes;
        token.current_price = attributes?.base_token_price_usd;
        token.fully_diluted_valuation = attributes?.fdv_usd;
        token.market_cap = attributes?.market_cap_usd;
        token.price_change_percentage_24h =
          attributes?.price_change_percentage.h24;
        token.total_volume = attributes?.volume_usd.h24;

        await this.tokenMarketsRepository.update(token);
      }
    } catch (err) {
      this.logger.error(`sync-aura-token has error: ${err.message}`, err.stack);
    }
  }

  @Process(QUEUES.SYNC_CW20_PRICE)
  async syncCW20TokenPrice(): Promise<void> {
    const numberCW20Tokens =
      await this.tokenMarketsRepository.countCw20TokensHavingCoinId();

    const limit = ENV_CONFIG.COINGECKO.MAX_REQUEST;
    const pages = Math.ceil(numberCW20Tokens / limit);
    for (let i = 0; i < pages; i++) {
      // Get data CW20 by paging
      const dataHavingCoinId =
        await this.tokenMarketsRepository.getCw20TokenMarketsHavingCoinId(
          limit,
          i,
        );

      const tokensHavingCoinId = dataHavingCoinId?.map((i) => i.coin_id);
      if (tokensHavingCoinId.length > 0) {
        this.handleSyncPriceVolume(tokensHavingCoinId);
      }
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

  async handleSyncPriceVolume(listTokens: string[]): Promise<void> {
    try {
      if (ENV_CONFIG.PRICE_HOST_SYNC === 'COIN_MARKET_CAP') {
        await this.syncCoinMarketCapPrice(listTokens);
      } else {
        await this.syncCoingeckoPrice(listTokens);
      }
    } catch (err) {
      this.logger.log(`sync-price-volume has error: ${err.message}`, err.stack);
      // Reconnect influxDb
      const errorCode = err?.code || '';
      if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
        this.connectInfluxdb();
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
      this._commonUtil.getDataAPI(coingecko.API, para),
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
      await this.tokenMarketsRepository.update(coinMarkets);

      this.logger.log(`============== Write data to Influxdb ==============`);
      await this.influxDbClient.writeBlockTokenPriceAndVolume(coinMarkets);
      this.logger.log(
        `============== Write data to Influxdb  successfully ==============`,
      );
    }
  }
}
