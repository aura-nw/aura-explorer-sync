import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { InjectSchedule, Schedule } from 'nest-schedule';

import * as util from 'util';
import {
  COINGECKO_API,
  CONTRACT_TYPE,
  INDEXER_API,
  REDIS_KEY,
} from '../common/constants/app.constant';
import { TokenHolderRequest } from '../dtos/requests/token-holder.request';
import { TokenCW20Dto } from '../dtos/token-cw20.dto';
import { CoingeckoMarkets } from '../entities';

import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { TokenRepository } from '../redis-om/repositories/token.repository';
import { CoingeckoMarketsRepository } from '../repositories/coingecko-markets.repository';

import { SmartContractRepository } from '../repositories/smart-contract.repository';

import { ConfigService, ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { InfluxDBClient } from '../utils/influxdb-client';
import { RedisUtil } from '../utils/redis.util';

@Injectable()
export class SyncTokenService {
  private readonly _logger = new Logger(SyncTokenService.name);
  private api;
  private isSyncCw20Tokens = false;
  private isSyncTokenIds = false;
  private isSyncCw721Tokens = false;
  private influxDbClient: InfluxDBClient;

  constructor(
    private configService: ConfigService,
    private _commonUtil: CommonUtil,
    private coingeckoMarketsRepository: CoingeckoMarketsRepository,
    private redisUtil: RedisUtil,
    @InjectSchedule() private readonly schedule: Schedule,
    private smartContractRepository: SmartContractRepository,
    private tokenRepository: TokenRepository
  ) {
    this._logger.log(
      '============== Constructor Sync Token Service ==============',
    );

    this.api = ENV_CONFIG.NODE.API;

    // Connect influxdb
    this.connectInfluxdb();

    // // Call method when init app
    (async () => {
      await this.tokenRepository.connectToServer();
      await this.syncTokenIds();
      await this.syncCW20TokensPrice();
    })();
  }

  async syncTokens(listTokens: any[], type: CONTRACT_TYPE) {
    if (listTokens.length > 0) {
      await this.redisUtil.connect();
      const coingeckoCoins = await this.redisUtil.getValue(
        REDIS_KEY.COINGECKO_COINS,
      );
      const coinList = JSON.parse(coingeckoCoins);
      const platform = ENV_CONFIG.COINGECKO.COINGEKO_PLATFORM;
      const smartContracts = [];
      for (let i = 0; i < listTokens.length; i++) {
        const contractAddress = listTokens[i].contract_address;
        let contract = await this.smartContractRepository.findOne({
          where: { contract_address: contractAddress },
        });

        contract = await this._commonUtil.queryMoreInfoFromCosmwasm(
          this.api,
          contractAddress,
          contract,
          type,
        );
        const coinInfo = coinList.find(
          (f) => f.platforms?.[`${platform}`] === contract.contract_address,
        );
        if (coinInfo) {
          contract.coin_id = coinInfo.id;
        }

        smartContracts.push(contract);
      }
      await this.smartContractRepository.insertOnDuplicate(smartContracts, [
        'id',
      ]);
    }
  }

  @Interval(2000)
  async syncCw721Tokens() {
    // check status
    if (this.isSyncCw721Tokens) {
      this._logger.log(null, 'already syncing cw721 tokens... wait');
      return;
    } else {
      this._logger.log(null, 'fetching data cw721 tokens...');
    }
    try {
      this.isSyncCw721Tokens = true;
      const listTokens =
        await this.smartContractRepository.getCW721TokensRegisteredType();

      await this.syncTokens(listTokens, CONTRACT_TYPE.CW721);

      this.isSyncCw721Tokens = false;
    } catch (error) {
      this._logger.error(
        `Sync cw721 tokens was error, ${error.name}: ${error.message}`,
      );
      this._logger.error(`${error.stack}`);
      this.isSyncCw721Tokens = false;
      throw error;
    }
  }

  @Interval(10000)
  async syncCw20Tokens() {
    // check status
    if (this.isSyncCw20Tokens) {
      this._logger.log(null, 'already syncing cw20 tokens... wait');
      return;
    } else {
      this._logger.log(null, 'fetching data cw20 tokens...');
    }
    try {
      this.isSyncCw20Tokens = true;
      const listTokens =
        await this.smartContractRepository.getCW20TokensRegisteredType();

      await this.syncTokens(listTokens, CONTRACT_TYPE.CW20);

      this.isSyncCw20Tokens = false;
    } catch (error) {
      this._logger.error(
        `Sync cw20 tokens was error, ${error.name}: ${error.message}`,
      );
      this._logger.error(`${error.stack}`);
      this.isSyncCw20Tokens = false;
      throw error;
    }
  }

  connectInfluxdb() {
    this._logger.log(
      `============== ${SyncTokenService.name}  call connectInfluxdb method ==============`,
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
      this._logger.log(
        `${SyncTokenService.name} call connectInfluxdb method has error: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * @todo: use for sync cw20 tokens price
   * Create thread to sync data
   */
  @Cron('0 */3 * * * *')
  async syncCW20TokensPrice() {
    const numberCW20Tokens =
      await this.smartContractRepository.countCw20TokensHavingCoinId();
    const defaultTokens: any[] = [
      { coinId: 'aura-network', address: '' },
      { coinId: 'bitcoin', address: '' },
    ];
    const countData = numberCW20Tokens + defaultTokens.length;

    const limit = ENV_CONFIG.COINGECKO.MAX_REQUEST;
    const pages = Math.ceil((countData + defaultTokens.length) / limit);
    const sefl = this;

    for (let i = 0; i < pages; i++) {
      this._logger.log(`============== Create threads ==============`);
      this.schedule.scheduleTimeoutJob(
        `CW20_Page${i}`,
        10,
        async () => {
          try {
            // Get data CW20 by paging
            const dataPage =
              await this.smartContractRepository.getCw20TokensHavingCoinId(
                limit,
                i,
              );

            const tokens = [];

            dataPage.forEach((item) => {
              const coinId = item.coin_id;
              tokens.push({
                coinId: coinId,
                address: item.contract_address,
              });
            });
            if (i === pages - 1) {
              tokens.push(defaultTokens);
            }

            await sefl.syncPriceAndVolume(tokens);
          } catch (err) {
            this._logger.log(
              `${SyncTokenService.name} call createThread method has error: ${err.message}`,
              err.stack,
            );
          }

          return true;
        },
        {
          maxRetry: -1,
        },
      );
    }
  }

  /**
   * Sync Price and Volume From Coingecko api
   * @param coinIds
   */
  async syncPriceAndVolume(tokenList: any[]) {
    this._logger.log(
      `============== ${SyncTokenService.name}  call ${this.syncPriceAndVolume.name} method ==============`,
    );
    const cw20Dtos: TokenCW20Dto[] = [];
    const coinMarkets: CoingeckoMarkets[] = [];
    try {
      const coingecko = ENV_CONFIG.COINGECKO;
      this._logger.log(`============== Call Coingecko Api ==============`);
      const coinIds = tokenList.map((i) => i.coinId).join(',');

      const para = `${util.format(
        COINGECKO_API.GET_COINS_MARKET,
        coinIds,
        coingecko.MAX_REQUEST,
      )}`;
      const response = await this._commonUtil.getDataAPI(coingecko.API, para);
      if (response) {
        for (let index = 0; index < response.length; index++) {
          const data = response[index];
          const tokenDto = SyncDataHelpers.makeTokenCW20Data(data);
          cw20Dtos.push(tokenDto);

          const filter = tokenList.find(
            (item) => item.coinId === tokenDto.coinId,
          );

          const coinInfo = SyncDataHelpers.makeCoinMarketsData(data);
          coinInfo.contract_address = filter?.address || '';
          // coinMarkets.push(coinInfo);

          // Write to redis
          await this.tokenRepository.save(coinInfo);
        }
      }
      // await this.coingeckoMarketsRepository.insertOnDuplicate(coinMarkets, [
      //   'id',
      //   'created_at',
      // ]);

      this._logger.log(`============== Write data to Influxdb ==============`);
      await this.influxDbClient.writeBlockTokenPriceAndVolume(cw20Dtos);
    } catch (err) {
      this._logger.log(
        `${SyncTokenService.name} call ${this.syncPriceAndVolume.name} method has error: ${err.message}`,
        err.stack,
      );
      // Reconnect influxDb
      const errorCode = err?.code || '';
      if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
        this.connectInfluxdb();
      }
    }
  }

  // @todo: use for sync cw20 token ids into redis
  @Cron('0 */5 * * * *')
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
}
