import { Injectable, Logger } from "@nestjs/common";
import { Cron, Interval } from '@nestjs/schedule';
import { InjectSchedule, Schedule } from "nest-schedule";
import * as util from 'util';
import { COINGECKO_API, CONTRACT_TYPE, INDEXER_API, NODE_API } from "../common/constants/app.constant";
import { TokenCW20Dto } from "../dtos/token-cw20.dto";
import { SyncDataHelpers } from "../helpers/sync-data.helpers";
import { NftRepository } from "../repositories/nft.repository";
import { TokenContractRepository } from "../repositories/token-contract.repository";
import { ConfigService, ENV_CONFIG } from "../shared/services/config.service";
import { CommonUtil } from "../utils/common.util";
import { InfluxDBClient } from "../utils/influxdb-client";
import { RedisUtil } from "../utils/redis.util";
@Injectable()
export class SyncTokenService {
    private readonly _logger = new Logger(SyncTokenService.name);
    private indexerUrl;
    private indexerChainId;
    private api;
    private isSyncCw20Tokens = false;
    private isSyncCw721Tokens = false;
    private influxDbClient: InfluxDBClient;
    private isConnectRedis = false;
    private syncInprogress = false;

    constructor(
        private configService: ConfigService,
        private _commonUtil: CommonUtil,
        private tokenContractRepository: TokenContractRepository,
        private nftRepository: NftRepository,
        private redisUtil: RedisUtil,
        @InjectSchedule() private readonly schedule: Schedule,
    ) {
        this._logger.log(
            '============== Constructor Sync Token Service ==============',
        );
        this.indexerUrl = this.configService.get('INDEXER_URL');
        this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');
        this.api = this.configService.get('API');

        // Connect influxdb
        this.connectInfluxdb();

        // Connect redis
        // this.schedule.scheduleCronJob('SYNC_PRICE_VOLUME', '60 * * * * *', async () => {
        //     await this.redisUtil.connect();
        //     await this.syncPriceAndVolume();
        //     return false;
        // });
        this.schedule.scheduleIntervalJob('SYNC_PRICE_VOLUME', 6000, async () => {
            try {
                await this.redisUtil.connect();
                await this.redisUtil.setValue('datakey1', { data: 'datakey====vaule' });
                // await this.redisUtil.getValue('datakey');

            } catch (err) {
                console.log(err);
            }
            return true;
        });
    }


    // @Interval(2000)
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
            //get list tokens from indexer
            const tokens = await this.getCw20TokensFromIndexer();
            if (tokens.length > 0) {
                for (let i = 0; i < tokens.length; i++) {
                    const item: any = tokens[i];
                    //get marketing info of token
                    const base64Request = Buffer.from(`{
                        "marketing_info": {}
                    }`).toString('base64');
                    const marketingInfo = await this._commonUtil.getDataAPI(
                        this.api,
                        `${util.format(
                            NODE_API.CONTRACT_INFO,
                            item.contract_address,
                            base64Request
                        )}`
                    );
                    const tokenContract = SyncDataHelpers.makerCw20TokenData(
                        item,
                        marketingInfo,
                    );

                    //insert/update table token_contracts
                    await this.tokenContractRepository.upsert([tokenContract], []);
                }
            }

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

    private async getCw20TokensFromIndexer(): Promise<any> {
        let key = '';
        let result = await this._commonUtil.getDataAPI(
            `${this.indexerUrl}${util.format(
                INDEXER_API.GET_LIST_TOKENS_FIRST_TIME,
                CONTRACT_TYPE.CW20,
                this.indexerChainId
            )}`,
            '',
        );
        key = result.data.nextKey;
        result = result.data.assets;
        while (key != null) {
            const dataTokens = await this._commonUtil.getDataAPI(
                `${this.indexerUrl}${util.format(
                    INDEXER_API.GET_LIST_TOKENS_WITH_NEXT_KEY,
                    CONTRACT_TYPE.CW20,
                    this.indexerChainId,
                    key
                )}`,
                '',
            );
            key = dataTokens.data.nextKey;
            result = dataTokens.data.assets.length > 0 ? [...result, ...dataTokens.data.assets] : result;
        }
        return result;
    }

    connectInfluxdb() {
        this._logger.log(`============== ${SyncTokenService.name}  call connectInfluxdb method ==============`);
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
            this._logger.log(`${SyncTokenService.name} call connectInfluxdb method has error: ${err.message}`, err.stack);
        }
    }

    // @Interval(2000)
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
            //get list tokens from indexer
            const tokens = await this.getCw721TokensFromIndexer();
            if (tokens.length > 0) {
                for (let i = 0; i < tokens.length; i++) {
                    const item: any = tokens[i];
                    //get token info
                    const base64Request = Buffer.from(`{
                        "contract_info": {}
                    }`).toString('base64');
                    const tokenInfo = await this._commonUtil.getDataAPI(
                        this.api,
                        `${util.format(
                            NODE_API.CONTRACT_INFO,
                            item.contract_address,
                            base64Request
                        )}`
                    );
                    const [tokenContract, nft] = SyncDataHelpers.makerCw721TokenData(
                        item,
                        tokenInfo
                    );

                    //insert/update table token_contracts
                    await this.tokenContractRepository.upsert([tokenContract], []);
                    //insert/update table nfts
                    await this.nftRepository.upsert([nft], []);
                }
            }

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

    private async getCw721TokensFromIndexer(): Promise<any> {
        let key = '';
        let result = await this._commonUtil.getDataAPI(
            `${this.indexerUrl}${util.format(
                INDEXER_API.GET_LIST_TOKENS_FIRST_TIME,
                CONTRACT_TYPE.CW721,
                this.indexerChainId
            )}`,
            '',
        );
        key = result.data.nextKey;
        result = result.data.assets;
        while (key != null) {
            const dataTokens = await this._commonUtil.getDataAPI(
                `${this.indexerUrl}${util.format(
                    INDEXER_API.GET_LIST_TOKENS_WITH_NEXT_KEY,
                    CONTRACT_TYPE.CW721,
                    this.indexerChainId,
                    key
                )}`,
                '',
            );
            key = dataTokens.data.nextKey;
            result = dataTokens.data.assets.length > 0 ? [...result, ...dataTokens.data.assets] : result;
        }
        return result;
    }

    /**
     * Create thread to sync data
     */
    // @Cron('60 * * * * *')
    async createThreads() {
        if (this.syncInprogress) {
            this._logger.log(`============== Thread sync data In-progress ==============`);
            return;
        }

        this.syncInprogress = true;
        const count = await this.tokenContractRepository.queryData('COUNT(id) AS countData', { type: CONTRACT_TYPE.CW20 });
        const countData = (count) ? Number(count[0]?.countData) : 0;
        if (countData > 0) {
            const limit = 100;
            const pages = Math.ceil(countData / limit);
            const sefl = this;
            for (let i = 0; i < pages; i++) {
                this._logger.log(`============== Create threads ==============`);
                this.schedule.scheduleTimeoutJob(`CW20_Page${i}`, 10, async () => {
                    try {
                        // Get data CW20 by paging
                        const selections = 'coin_id, name, symbol, contract_address, type';
                        const dataPage = await this.tokenContractRepository.queryPaging(
                            selections,
                            limit,
                            (i * limit),
                            { type: CONTRACT_TYPE.CW20 },
                            null,
                            { id: 'DESC' });


                        // Create list IDs to call  Coingecko api
                        let coinIds = 'aura-network,bitcoin';
                        dataPage.forEach(async (item) => {
                            const coinId = item.coin_id;
                            coinIds += (coinId) ? `${coinId},` : `${coinId}`;
                        });

                        this._logger.log(`============== Call syncPriceAndVolume method: ${coinIds} ==============`);
                        await sefl.syncPriceAndVolume(coinIds)
                    } catch (err) {
                        this._logger.log(`${SyncTokenService.name} call createThread method has error: ${err.message}`, err.stack);
                    }

                    return true;
                },
                    { maxRetry: -1 });

            }
        }
        this.syncInprogress = false;
    }

    /**
     * Sync Price and Volume From Coingecko api
     * @param coinIds 
     */
    async syncPriceAndVolume(coinIds: string) {
        this._logger.log(`============== ${SyncTokenService.name}  call syncPriceAndVolume method ==============`);
        try {
            const cw20Dtos: TokenCW20Dto[] = [];
            const coingecko = ENV_CONFIG.COINGECKO;
            this._logger.log(`============== Call Coingecko Api ==============`);
            const para = `${util.format(COINGECKO_API.GET_COINS_MARKET, coinIds, 100)}`;
            const [response] = await Promise.all([this._commonUtil.getDataAPI(coingecko.API, para)]);
            if (response) {

                response.forEach(async data => {
                    const timestamp = new Date(data.last_updated);
                    timestamp.setSeconds(0, 0);

                    const tokenDto = new TokenCW20Dto();
                    tokenDto.coinId = data.id;
                    tokenDto.current_price = data.current_price;
                    tokenDto.market_cap_rank = data.market_cap_rank;
                    tokenDto.price_change_24h = data.price_change_24h;
                    tokenDto.price_change_percentage_24h = data.price_change_percentage_24h;
                    tokenDto.last_updated = data.last_updated;
                    tokenDto.total_volume = data.usd_24h_vol;
                    tokenDto.timestamp = timestamp.toISOString();
                    cw20Dtos.push(tokenDto);

                    this._logger.log(`============== Write data to Redis ==============`);
                    // Write data to Redis
                    // await this.redisUtil.setValue(tokenDto.coinId, tokenDto);

                });
            }
            this._logger.log(`============== Write data to Influxdb ==============`);
            // await this.influxDbClient.writeBlockTokenPriceAndVolume(cw20Dtos);

        } catch (err) {
            this._logger.log(`${SyncTokenService.name} call syncPriceAndVolume method has error: ${err.message}`, err.stack);
        }
    }
}