import { Injectable, Logger } from "@nestjs/common";
import { CommonUtil } from "../utils/common.util";
import { ConfigService } from "../shared/services/config.service";
import { TokenContractRepository } from "../repositories/token-contract.repository";
import { Interval } from '@nestjs/schedule';
import * as util from 'util';
import { CONTRACT_TYPE, INDEXER_API, NODE_API } from "../common/constants/app.constant";
import { SyncDataHelpers } from "../helpers/sync-data.helpers";
import { NftRepository } from "../repositories/nft.repository";
import { SmartContractRepository } from "../repositories/smart-contract.repository";
import { Cw20TokenOwnerRepository } from "../repositories/cw20-token-owner.repository";

@Injectable()
export class SyncTokenService {
    private readonly _logger = new Logger(SyncTokenService.name);
    private indexerUrl;
    private indexerChainId;
    private api;
    private isSyncCw20Tokens = false;
    private isSyncCw721Tokens = false;

    constructor(
        private configService: ConfigService,
        private _commonUtil: CommonUtil,
        private tokenContractRepository: TokenContractRepository,
        private nftRepository: NftRepository,
        private smartContractRepository: SmartContractRepository,
        private cw20TokenOwnerRepository: Cw20TokenOwnerRepository
    ) {
        this._logger.log(
            '============== Constructor Sync Token Service ==============',
        );
        this.indexerUrl = this.configService.get('INDEXER_URL');
        this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');
        this.api = this.configService.get('API');
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
            const tokens = await this.getCw20TokensFromIndexer();
            if (tokens.length > 0) {
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
            const tokens = await this.getCw721TokensFromIndexer();
            if (tokens.length > 0) {
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
}