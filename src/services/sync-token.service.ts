import { Injectable, Logger } from "@nestjs/common";
import { Cron, Interval } from '@nestjs/schedule';
import { InjectSchedule, Schedule } from "nest-schedule";
import * as util from 'util';
import { AURA_INFO, COINGECKO_API, CONTRACT_TYPE, INDEXER_API, KEYWORD_SEARCH_TRANSACTION } from "../common/constants/app.constant";
import { TokenHolderRequest } from "../dtos/requests/token-holder.request";
import { TokenCW20Dto } from "../dtos/token-cw20.dto";
import { TokenContract } from "../entities/token-contract.entity";
import { SyncDataHelpers } from "../helpers/sync-data.helpers";
import { Cw20TokenOwnerRepository } from "../repositories/cw20-token-owner.repository";
import { SmartContractRepository } from "../repositories/smart-contract.repository";
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
    private isSyncAuraToken = false;
    private isSyncCw721Tokens = false;
    private influxDbClient: InfluxDBClient;
    private syncInprogress = false;
    private isSynAuraAndBtcToken = false;

    constructor(
        private configService: ConfigService,
        private _commonUtil: CommonUtil,
        private tokenContractRepository: TokenContractRepository,
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
            //connect redis
            await this.redisUtil.connect();
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
                        const marketingInfo = await this._commonUtil.getDataContractFromBase64Query(this.api, item.contract_address, base64Request);
                        //get token info
                        const tokenContractData = await this.tokenContractRepository.findOne({
                            where: { contract_address: item.contract_address },
                        });
                        let tokenInfo = null;
                        if (tokenContractData) {
                            const data = await this.redisUtil.getValue(tokenContractData.coin_id);
                            if (data) {
                                tokenInfo = JSON.parse(data);
                            }
                        }
                        const [tokenContract, cw20TokenOwner] = SyncDataHelpers.makerCw20TokenData(
                            item,
                            marketingInfo,
                            tokenInfo
                        );

                        //insert/update table token_contracts
                        await this.tokenContractRepository.insertOnDuplicate([tokenContract], ['id', 'created_at']);
                        //insert/update table cw20_token_owners
                        await this.cw20TokenOwnerRepository.insertOnDuplicate([cw20TokenOwner], ['id', 'created_at']);
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

    @Interval(3000)
    async syncAuraToken() {
        // check status
        if (this.isSyncAuraToken) {
            this._logger.log(null, 'already syncing aura token... wait');
            return;
        } else {
            this._logger.log(null, 'fetching data aura token...');
        }
        try {
            this.isSyncAuraToken = true;
            //connect redis
            await this.redisUtil.connect();
            //sync data aura
            const tokenAura = new TokenContract();
            tokenAura.type = CONTRACT_TYPE.CW20;
            tokenAura.name = ENV_CONFIG.CHAIN_INFO.COIN_DENOM;
            tokenAura.symbol = ENV_CONFIG.CHAIN_INFO.COIN_MINIMAL_DENOM
            tokenAura.decimals = ENV_CONFIG.CHAIN_INFO.COIN_DECIMALS;
            tokenAura.image = AURA_INFO.IMAGE;
            tokenAura.contract_address = AURA_INFO.CONNTRACT_ADDRESS;
            tokenAura.description = '';
            tokenAura.num_tokens = 0;
            //get price of aura token
            const tokenAuraData = await this.redisUtil.getValue(AURA_INFO.COIN_ID);
            if (tokenAuraData) {
                const tokenAuraInfo = JSON.parse(tokenAuraData);
                tokenAura.coin_id = tokenAuraInfo.coinId;
                tokenAura.price = tokenAuraInfo.current_price;
                tokenAura.price_change_percentage_24h = tokenAuraInfo.price_change_percentage_24h || 0;
            }
            //insert/update table token_contracts
            this._logger.log(`Update price aura coin: ${JSON.stringify(tokenAura)}`);
            await this.tokenContractRepository.insertOnDuplicate([tokenAura], ['id', 'created_at']);

            this.isSyncAuraToken = false;
        } catch (error) {
            this._logger.error(
                `Sync aura token was error, ${error.name}: ${error.message}`,
            );
            this._logger.error(`${error.stack}`);
            this.isSyncAuraToken = false;
            throw error;
        }
    }

    @Interval(2000)
    async syncOldCw721Tokens() {
        // check status
        if (this.isSyncCw721Tokens) {
            this._logger.log(null, 'already syncing cw721 tokens... wait');
            return;
        } else {
            this._logger.log(null, 'fetching data cw721 tokens...');
        }
        try {
            this.isSyncCw721Tokens = true;
            const listTokens = await this.smartContractRepository.getOldTokens(CONTRACT_TYPE.CW721, KEYWORD_SEARCH_TRANSACTION.MINT_CONTRACT_CW721);
            if (listTokens.length > 0) {
                let smartContracts = [];
                for (let i = 0; i < listTokens.length; i++) {
                    const contractAddress = listTokens[i].contract_address;
                    const contract = await this.smartContractRepository.findOne({
                        where: { contract_address: contractAddress },
                    });
                    contract.is_minted = true;
                    //get token info
                    const base64RequestToken = Buffer.from(`{
                            "contract_info": {}
                        }`).toString('base64');
                    const tokenInfo = await this._commonUtil.getDataContractFromBase64Query(this.api, contractAddress, base64RequestToken);
                    if (tokenInfo?.data) {
                        contract.token_name = tokenInfo.data.name;
                        contract.token_symbol = tokenInfo.data.symbol;
                    }
                    //get num tokens
                    const base64RequestNumToken = Buffer.from(`{
                        "num_tokens": {}
                    }`).toString('base64');
                    const numTokenInfo = await this._commonUtil.getDataContractFromBase64Query(this.api, contractAddress, base64RequestNumToken);
                    if (numTokenInfo?.data) {
                        contract.num_tokens = Number(numTokenInfo.data.count);
                    }
                    smartContracts.push(contract);
                }
                await this.smartContractRepository.insertOnDuplicate(smartContracts, ['id']);
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
     * @todo: use for sync cw20 tokens price
     * Create thread to sync data
     */
    // @Cron('0 */3 * * * *')
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
            const tokenHolders: TokenHolderRequest[] = [];
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
                            tokenHolders.push({ coinId: item.coin_id, address: item.contract_address });
                        });

                        this._logger.log(`============== Call syncPriceAndVolume method: ${coinIds} ==============`);
                        await sefl.syncPriceAndVolume(coinIds, tokenHolders);
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
    async syncPriceAndVolume(coinIds: string, tokenHolders: TokenHolderRequest[]) {
        this._logger.log(`============== ${SyncTokenService.name}  call ${this.syncPriceAndVolume.name} method ==============`);
        try {
            const cw20Dtos: TokenCW20Dto[] = [];
            const coingecko = ENV_CONFIG.COINGECKO;
            this._logger.log(`============== Call Coingecko Api ==============`);
            const para = `${util.format(COINGECKO_API.GET_COINS_MARKET, coinIds, coingecko.MAX_REQUEST)}`;
            const response = await this._commonUtil.getDataAPI(coingecko.API, para);
            if (response) {

                response.forEach(async data => {
                    const timestamp = new Date(data.last_updated);
                    timestamp.setSeconds(0, 0);

                    const tokenDto = SyncDataHelpers.makeTokenCW20Data(data);

                    // Find data to call indexer api
                    const filter = tokenHolders.find(item => item.coinId === tokenDto.coinId);
                    if (filter) {
                        this._logger.log(`============== Call Idexer apis with parameter: {chainId: ${this.indexerChainId}, address:${filter.address}} ==============`);
                        const para = `${util.format(INDEXER_API.GET_HOLDER_TOKEN, this.indexerChainId, filter.address)}`;
                        const response = await this._commonUtil.getDataAPI(this.indexerUrl, para);
                        if (response) {
                            this._logger.log(`============== Get data from Redis with key: ${tokenDto.coinId} ==============`);
                            const redisData = await this.redisUtil.getValue(tokenDto.coinId);
                            if (redisData) {
                                this._logger.log(`============== RedisData: ${redisData} ==============`);
                                const tokenRedids = JSON.parse(redisData) as TokenCW20Dto;
                                tokenDto.previous_holder = Number(tokenRedids.current_holder) || 0;
                                tokenDto.current_holder = Number(response?.data.resultCount) || 0;
                                const holder24h = (tokenDto.current_holder - tokenDto.previous_holder);
                                if (tokenDto.previous_holder > 0 && holder24h > 0) {
                                    tokenDto.percent_holder = Math.round((holder24h * 100) / tokenDto.previous_holder);
                                } else {
                                    tokenDto.percent_holder = 0;
                                }

                            } else {
                                this._logger.log(`============== RedisData not values ==============`);
                                tokenDto.previous_holder = 0;
                                tokenDto.percent_holder = 100;
                                tokenDto.current_holder = Number(response.resultCount);
                            }
                        }
                    }

                    cw20Dtos.push(tokenDto);

                    this._logger.log(`============== Write data to Redis ==============`);
                    await this.redisUtil.setValue(tokenDto.coinId, tokenDto);

                });
            }
            this._logger.log(`============== Write data to Influxdb ==============`);
            await this.influxDbClient.writeBlockTokenPriceAndVolume(cw20Dtos);

        } catch (err) {
            this._logger.log(`${SyncTokenService.name} call ${this.syncPriceAndVolume.name} method has error: ${err.message}`, err.stack);
        }
    }

    @Interval(2000)
    async syncAuraAndBtcTokens() {
        // check status
        if (this.isSynAuraAndBtcToken) {
            this._logger.log(null, 'already syncing aura and btc tokens... wait');
            return;
        } else {
            this._logger.log(null, 'fetching data aura and btc tokens...');
        }
        try {
            this.isSynAuraAndBtcToken = true;

            let coinIds = 'aura-network,bitcoin';
            const cw20Dtos: TokenCW20Dto[] = [];
            const coingecko = ENV_CONFIG.COINGECKO;
            this._logger.log(`============== Call Coingecko Api ==============`);
            const para = `${util.format(COINGECKO_API.GET_COINS_MARKET, coinIds, coingecko.MAX_REQUEST)}`;
            const response = await this._commonUtil.getDataAPI(coingecko.API, para);
            if (response) {
                response.forEach(async data => {
                    const tokenDto = SyncDataHelpers.makeTokenCW20Data(data);
                    cw20Dtos.push(tokenDto);

                    this._logger.log(`============== Write data to Redis ==============`);
                    await this.redisUtil.setValue(tokenDto.coinId, tokenDto)
                });
            }
            this._logger.log(`============== Write data to Influxdb ==============`);
            await this.influxDbClient.writeBlockTokenPriceAndVolume(cw20Dtos);

            this.isSynAuraAndBtcToken = false;
        } catch (error) {
            this._logger.error(
                `Sync aura and btc tokens was error, ${error.name}: ${error.message}`,
            );
            this._logger.error(`${error.stack}`);
            this.isSynAuraAndBtcToken = false;
            throw error;
        }
    }
}