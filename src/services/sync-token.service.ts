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
import { SmartContractRepository } from "../repositories/smart-contract.repository";
import { Cw20TokenOwnerRepository } from "../repositories/cw20-token-owner.repository";
import { env } from "process";

@Injectable()
export class SyncTokenService {
    private readonly _logger = new Logger(SyncTokenService.name);
    private indexerUrl;
    private indexerChainId;
    private api;
    private isSyncCw20Tokens = false;
    private isSyncCw721Tokens = false;
    private influxDbClient: InfluxDBClient;
    private syncInprogress = false;

    constructor(
        private configService: ConfigService,
        private _commonUtil: CommonUtil,
        private tokenContractRepository: TokenContractRepository,
        private nftRepository: NftRepository,
        private redisUtil: RedisUtil,
        @InjectSchedule() private readonly schedule: Schedule,
        private smartContractRepository: SmartContractRepository,
        private cw20TokenOwnerRepository: Cw20TokenOwnerRepository
    ) {
        this._logger.log(
            '============== Constructor Sync Token Service ==============',
        );
        this.indexerUrl = this.configService.get('INDEXER_URL');
        this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');
        this.api = ENV_CONFIG.NODE.API;

        // Connect influxdb
        this.connectInfluxdb();

        // Call method when init app
        (async () => {
            await this.createThreads();
        })();
    }


    @Interval(2000)
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
            const tokensData = await this._commonUtil.getDataAPI(
                `${this.indexerUrl}${util.format(
                    INDEXER_API.GET_LIST_TOKENS,
                    CONTRACT_TYPE.CW20,
                    this.indexerChainId
                )}`,
                '',
            );
            if (tokensData?.data && tokensData.data.count > 0) {
                const tokens = tokensData.data.assets;
                for (let i = 0; i < tokens.length; i++) {
                    const item: any = tokens[i];
                    //check exist contract in db
                    const contract = await this.smartContractRepository.findOne({
                        where: { contract_address: item.contract_address },
                    });
                    if (contract) {
                        //get marketing info of token
                        const base64Request = Buffer.from(`{
                            "marketing_info": {}
                        }`).toString('base64');
                        const marketingInfo = await this.getDataContractFromBase64Query(item.contract_address, base64Request);
                        const [tokenContract, cw20TokenOwner] = SyncDataHelpers.makerCw20TokenData(
                            item,
                            marketingInfo,
                        );

                        //insert/update table token_contracts
                        await this.tokenContractRepository.upsert([tokenContract], []);
                        //insert/update table cw20_token_owners
                        await this.cw20TokenOwnerRepository.upsert([cw20TokenOwner], []);
                    }
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
            //get list tokens from indexer
            const tokensData = await this._commonUtil.getDataAPI(
                `${this.indexerUrl}${util.format(
                    INDEXER_API.GET_LIST_TOKENS,
                    CONTRACT_TYPE.CW721,
                    this.indexerChainId
                )}`,
                '',
            );
            if (tokensData?.data && tokensData.data.count > 0) {
                const tokens = tokensData.data.assets;
                for (let i = 0; i < tokens.length; i++) {
                    const item: any = tokens[i];
                    //check exist contract in db
                    const contract = await this.smartContractRepository.findOne({
                        where: { contract_address: item.contract_address },
                    });
                    if (contract) {
                        //get token info
                        const base64RequestToken = Buffer.from(`{
                            "contract_info": {}
                        }`).toString('base64');
                        const tokenInfo = await this.getDataContractFromBase64Query(item.contract_address, base64RequestToken);
                        //get nft info
                        let nftInfo = {};
                        if (!item.is_burned) {
                            const base64RequestNft = Buffer.from(`{
                                "owner_of": { "token_id": "${item.token_id}" }
                            }`).toString('base64');
                            nftInfo = await this.getDataContractFromBase64Query(item.contract_address, base64RequestNft);
                        }
                        //get num tokens
                        const base64RequestNumToken = Buffer.from(`{
                            "num_tokens": {}
                        }`).toString('base64');
                        const numTokenInfo = await this.getDataContractFromBase64Query(item.contract_address, base64RequestNumToken);
                        const [tokenContract, nft] = SyncDataHelpers.makerCw721TokenData(
                            item,
                            tokenInfo,
                            nftInfo,
                            numTokenInfo
                        );

                        //insert/update table token_contracts
                        await this.tokenContractRepository.upsert([tokenContract], []);
                        //insert/update table nfts
                        await this.nftRepository.upsert([nft], []);
                    }
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

    private async getDataContractFromBase64Query(contract_address: string, base64String: string): Promise<any> {
        return await this._commonUtil.getDataAPI(
            this.api,
            `${util.format(
                NODE_API.CONTRACT_INFO,
                contract_address,
                base64String
            )}`
        );
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

    /**
     * Create thread to sync data
     */
    @Cron('0 */3 * * * *')
    async createThreads() {
        if (this.syncInprogress) {
            this._logger.log(`============== Thread sync data In-progress ==============`);
            return;
        }
        // Connect reids server
        await this.redisUtil.connect();

        this.syncInprogress = true;
        const count = await this.tokenContractRepository.queryData('COUNT(id) AS countData', { type: CONTRACT_TYPE.CW20 });
        const countData = (count) ? Number(count[0]?.countData) : 0;
        if (countData > 0) {
            const limit = ENV_CONFIG.COINGECKO.MAX_REQUEST;
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
                            i,
                            { type: CONTRACT_TYPE.CW20 },
                            null,
                            { id: 'DESC' });

                        // Create list IDs to call  Coingecko api
                        let coinIds = 'aura-network,bitcoin';
                        dataPage.forEach(async (item) => {
                            const coinId = item.coin_id;
                            coinIds += (coinId) ? `, ${coinId}` : '';
                        });

                        this._logger.log(`============== Call syncPriceAndVolume method: ${coinIds} ==============`);
                        await sefl.syncPriceAndVolume(coinIds)
                    } catch (err) {
                        this._logger.log(`${SyncTokenService.name} call createThread method has error: ${err.message}`, err.stack);
                    }

                    return true;
                },
                    {
                        maxRetry: -1
                    });

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
            const para = `${util.format(COINGECKO_API.GET_COINS_MARKET, coinIds, coingecko.MAX_REQUEST)}`;
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
                    tokenDto.timestamp = data.last_updated;
                    tokenDto.type = CONTRACT_TYPE.CW20;
                    tokenDto.circulating_supply = data.circulating_supply;
                    tokenDto.max_supply = data.max_supply;
                    cw20Dtos.push(tokenDto);

                    this._logger.log(`============== Write data to Redis ==============`);
                    // Write data to Redis
                    await this.redisUtil.setValue(tokenDto.coinId, tokenDto);

                });
            }
            this._logger.log(`============== Write data to Influxdb ==============`);
            await this.influxDbClient.writeBlockTokenPriceAndVolume(cw20Dtos);

        } catch (err) {
            this._logger.log(`${SyncTokenService.name} call syncPriceAndVolume method has error: ${err.message}`, err.stack);
        }
    }
}