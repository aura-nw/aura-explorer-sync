import { Injectable, Logger } from "@nestjs/common";
import { CommonUtil } from "../utils/common.util";
import { ConfigService } from "../shared/services/config.service";
import { TokenContractRepository } from "../repositories/token-contract.repository";
import { Interval } from '@nestjs/schedule';
import * as util from 'util';
import { CONTRACT_TYPE, INDEXER_API, NODE_API } from "../common/constants/app.constant";
import { TokenContract } from "../entities";
import { SyncDataHelpers } from "../helpers/sync-data.helpers";

@Injectable()
export class SyncTokenService {
    private readonly _logger = new Logger(SyncTokenService.name);
    private indexerUrl;
    private indexerChainId;
    private api;
    private isSyncToken = false;

    constructor(
        private configService: ConfigService,
        private _commonUtil: CommonUtil,
        private tokenContractRepository: TokenContractRepository,
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
        if (this.isSyncToken) {
            this._logger.log(null, 'already syncing token... wait');
            return;
        } else {
            this._logger.log(null, 'fetching data token...');
        }
        try {
            this.isSyncToken = true;
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
                            item.constract_address,
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

            this.isSyncToken = false;
        } catch (error) {
            this._logger.error(
                `Sync token was error, ${error.name}: ${error.message}`,
            );
            this._logger.error(`${error.stack}`);
            this.isSyncToken = false;
            throw error;
        }
    }

    private async getCw20TokensFromIndexer(): Promise<any> {
        let key = '';
        let result = await this._commonUtil.getDataAPI(
            `${this.indexerUrl}${util.format(
                INDEXER_API.GET_LIST_CW20_TOKENS_FIRST_TIME,
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
                    INDEXER_API.GET_LIST_CW20_TOKENS_WITH_NEXT_KEY,
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
}