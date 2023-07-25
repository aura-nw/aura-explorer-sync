import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueError,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import * as util from 'util';
import {
  COINGECKO_API,
  SOULBOUND_TOKEN_STATUS,
  SOULBOUND_PICKED_TOKEN,
  QUEUES,
  COIN_MARKET_CAP_API,
  REDIS_KEY,
  PROCESSOR,
} from '../common/constants/app.constant';
import { TokenMarkets } from '../entities';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import { ConfigService, ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { RedisUtil } from '../utils/redis.util';

import { HttpService } from '@nestjs/axios';
import { In } from 'typeorm';
import { InfluxDBClient } from '../utils/influxdb-client';
import { SoulboundTokenRepository } from '../repositories/soulbound-token.repository';
import { SoulboundToken } from '../entities/soulbound-token.entity';
import { lastValueFrom, timeout, retry } from 'rxjs';

@Processor(PROCESSOR.SMART_CONTRACT)
export class SmartContractsProcessor {
  private readonly logger = new Logger(SmartContractsProcessor.name);
  private indexerChainId;
  private influxDbClient: InfluxDBClient;

  constructor(
    private _commonUtil: CommonUtil,
    private tokenMarketsRepository: TokenMarketsRepository,
    private redisUtil: RedisUtil,
    private configService: ConfigService,
    private httpService: HttpService,
    private soulboundTokenRepos: SoulboundTokenRepository,
  ) {
    this.logger.log(
      '============== Constructor Smart Contracts Processor Service ==============',
    );

    this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');

    // Connect influxdb
    this.connectInfluxdb();
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

  @Process(QUEUES.SYNC_PRICE_VOLUME)
  async handleSyncPriceVolume(job: Job) {
    try {
      const listTokens = job.data.listTokens;
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

  @Process(QUEUES.SYNC_COIN_ID)
  async handleSyncCoinId(job: Job) {
    try {
      this.logger.log(
        `============== sync-coin-id from coingecko start ==============`,
      );
      const tokens = job.data.tokens;

      await this.redisUtil.connect();
      const coingeckoCoins = await this.redisUtil.getValue(
        REDIS_KEY.COINGECKO_COINS,
      );
      const coinList = JSON.parse(coingeckoCoins);
      const platform = ENV_CONFIG.COINGECKO.COINGEKO_PLATFORM;
      const updatingTokens: TokenMarkets[] = [];

      tokens.forEach((item: TokenMarkets) => {
        const coinInfo = coinList.find(
          (f) => f.platforms?.[`${platform}`] === item.contract_address,
        );
        if (coinInfo) {
          item.coin_id = coinInfo.id;
          updatingTokens.push(item);
        }
      });

      if (updatingTokens.length > 0) {
        await this.tokenMarketsRepository.update(updatingTokens);
      }
    } catch (err) {
      this.logger.error(`sync-coin-id has error: ${err.message}`, err.stack);
    }
  }

  @Process(QUEUES.SYNC_CW4973_NFT_STATUS)
  async handleSyncCw4973NftStatus(job: Job) {
    this.logger.log(
      `============== Queue handleSyncCw4973NftStatus was run! ==============`,
    );
    try {
      const takeContracts: any = job.data.takeMessage;
      const unequipContracts: any = job.data.unequipMessage;
      const takes = takeContracts?.msg?.take?.signature.signature;
      const unequips = unequipContracts?.msg?.unequip?.token_id;
      const contractAddress = job.data.contractAddress;
      const tokenUri = takeContracts?.msg?.take?.uri;
      const receiverAddress = job.data.receiverAddress;

      if (takeContracts) {
        const tokenId = this._commonUtil.createTokenId(
          this.indexerChainId,
          receiverAddress,
          takeContracts?.msg?.take?.from,
          tokenUri,
        );

        const newSBTToken = await this.soulboundTokenRepos.findOne({
          where: { contract_address: contractAddress, token_id: tokenId },
        });

        if (!newSBTToken) {
          const entity = new SoulboundToken();
          const ipfs = await lastValueFrom(
            this.httpService
              .get(this._commonUtil.transform(tokenUri))
              .pipe(timeout(8000), retry(5)),
          )
            .then((rs) => rs.data)
            .catch(() => {
              return null;
            });

          let contentType;
          const imgUrl = !!ipfs?.animation_url
            ? ipfs?.animation_url
            : ipfs?.image;
          if (imgUrl) {
            contentType = await lastValueFrom(
              this.httpService
                .get(this._commonUtil.transform(imgUrl))
                .pipe(timeout(18000), retry(5)),
            )
              .then((rs) => rs?.headers['content-type'])
              .catch(() => {
                return null;
              });
          }

          entity.contract_address = contractAddress;
          entity.receiver_address = receiverAddress;
          entity.token_uri = tokenUri;
          entity.signature = takeContracts?.msg?.take?.signature.signature;
          entity.pub_key = takeContracts?.msg?.take?.signature.pub_key;
          entity.token_img = ipfs?.image;
          entity.token_name = ipfs?.name;
          entity.img_type = contentType;
          entity.animation_url = ipfs?.animation_url;
          entity.token_id = tokenId;
          try {
            await this.soulboundTokenRepos.insert(entity);
          } catch (err) {
            this.logger.error(`sync-cw4973-nft-status has error: ${err.stack}`);
          }
        }
      }

      const soulboundTokens = await this.soulboundTokenRepos.find({
        where: [
          { signature: takes, contract_address: contractAddress },
          { token_id: unequips, contract_address: contractAddress },
        ],
      });
      if (soulboundTokens) {
        const receiverAddress = soulboundTokens.map((m) => m.receiver_address);
        const soulboundTokenInfos = await this.soulboundTokenRepos.find({
          where: {
            receiver_address: In(receiverAddress),
          },
        });
        soulboundTokens.forEach((item) => {
          let token;
          if (
            item.signature === takeContracts?.msg?.take?.signature.signature
          ) {
            token = takeContracts;
          }

          if (item.token_id === unequipContracts?.msg?.unequip?.token_id) {
            token = unequipContracts;
          }

          if (token?.msg?.take) {
            const numOfTokens = soulboundTokenInfos?.filter(
              (f) =>
                f.receiver_address === item.receiver_address &&
                (f.status === SOULBOUND_TOKEN_STATUS.EQUIPPED ||
                  f.status === SOULBOUND_TOKEN_STATUS.UNEQUIPPED),
            );
            if (
              numOfTokens?.length < SOULBOUND_PICKED_TOKEN.MAX &&
              item.status === SOULBOUND_TOKEN_STATUS.UNCLAIM
            ) {
              item.picked = true;
            }
            item.status = SOULBOUND_TOKEN_STATUS.EQUIPPED;
          } else {
            item.status = SOULBOUND_TOKEN_STATUS.UNEQUIPPED;
            item.picked = false;
          }
        });
        this.soulboundTokenRepos.update(soulboundTokens);
      }
      this.logger.log(
        `sync-cw4973-nft-status update complete: ${JSON.stringify(
          soulboundTokens,
        )}`,
      );
    } catch (err) {
      this.logger.error(`sync-cw4973-nft-status has error: ${err.stack}`);
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id} of type ${job.name}...`);
  }

  @OnQueueCompleted()
  async onComplete(job: Job, result: any) {
    this.logger.log(`Completed job ${job.id} of type ${job.name}`);
    this.logger.log(`Result: ${result}`);
  }

  @OnQueueError()
  onError(job: Job, error: Error) {
    this.logger.error(`Job: ${job}`);
    this.logger.error(`Error job ${job.id} of type ${job.name}`);
    this.logger.error(`Error: ${error}`);
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}`);
    this.logger.error(`Error: ${error}`);
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
