import { Inject, Injectable, Logger } from "@nestjs/common";
import { StargateClient } from "@cosmjs/stargate";
import { REPOSITORY_INTERFACE } from "src/module.config";
import { ISmartContractRepository } from "src/repositories/ismart-contract.repository";
import { ConfigService } from "src/shared/services/config.service";
import { CommonUtil } from "src/utils/common.util";
import { ISyncRestService } from "../isync-rest.service";

@Injectable()
export class SyncRestService implements ISyncRestService {
    private readonly _logger = new Logger(SyncRestService.name);
    private rpc;
    private api;

    constructor(
        private configService: ConfigService,
        private _commonUtil: CommonUtil,
        @Inject(REPOSITORY_INTERFACE.ISMART_CONTRACT_REPOSITORY)
        private smartContractRepository: ISmartContractRepository,
    ) {
        this._logger.log(
            '============== Constructor Sync Rest Service ==============',
        );
        this.rpc = this.configService.get('RPC');
        this.api = this.configService.get('API');

        // this.initSyncRest();
    }

    async initSyncRest() {
        this._logger.log('syncFromRest');
        this.syncFromNetwork();
    }

    async getLatestBlockHeight() {
        const lastHeight = await this.smartContractRepository.getLatestBlockHeight();
        return lastHeight;
    }

    /**
     * Get transactions through rest service if the app is crashed and restarted
     */
    async syncFromNetwork() {
        try {
            const client = await StargateClient.connect(this.rpc);
            // Get the current block height received from websocket
            let currentHeight = (await client.getBlock()).header.height;
            // Get the last block height from DB
            let lastHeight = await this.getLatestBlockHeight();

            const paramMissedBlock = `block_search?query="block.height >= ${lastHeight} AND block.height <= ${currentHeight}"`;

            const blockData = await this._commonUtil.getDataRPC(this.rpc, paramMissedBlock);
        } catch (error) {
            
        }
    }
}