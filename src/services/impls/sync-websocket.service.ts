import { Inject, Injectable, Logger } from "@nestjs/common";
import * as WebSocket from 'ws';
import { MESSAGE_ACTION, SMART_CONTRACT_VERIFICATION } from "src/common/constants/app.constant";
import { ConfigService } from "src/shared/services/config.service";
import { ISyncWebsocketService } from "../isync-websocket.service";
import { REPOSITORY_INTERFACE } from "src/module.config";
import { ISmartContractRepository } from "src/repositories/ismart-contract.repository";
import { CommonUtil } from "src/utils/common.util";

@Injectable()
export class SyncWebsocketService implements ISyncWebsocketService {
    private readonly _logger = new Logger(SyncWebsocketService.name);
    private websocketSubscriber;
    private smartContractService;
    private listMessageAction = [MESSAGE_ACTION.MSG_EXECUTE_CONTRACT, MESSAGE_ACTION.MSG_INSTANTIATE_CONTRACT, MESSAGE_ACTION.MSG_MIGRATE_CONTRACT, MESSAGE_ACTION.MSG_SEND, MESSAGE_ACTION.MSG_STORE_CODE];

    constructor(
        private configService: ConfigService,
        private _commonUtil: CommonUtil,
        @Inject(REPOSITORY_INTERFACE.ISMART_CONTRACT_REPOSITORY)
        private smartContractRepository: ISmartContractRepository,
    ) {
        this._logger.log(
            '============== Constructor Sync Websocket Service ==============',
        );
        this.websocketSubscriber = this.configService.get('WEBSOCKET_URL');
        this.smartContractService = this.configService.get('SMART_CONTRACT_SERVICE');
        this.startSyncWebsocket();
    }

    async startSyncWebsocket() {
        // Wait for rest service start first
        await this.sleep(5000);
        this._logger.log('syncFromNetwork');
        let websocketUrl = this.websocketSubscriber;
        let self = this;
        let websocket = new WebSocket(websocketUrl);
        websocket.on('open', function () {
            self.connectWebsocket(this);
        });
        websocket.on('message', function (message) {
            self.handleMessage(message);
        });
        websocket.on('error', (error) => {
            self._logger.error(error);
            websocket.terminate();
            process.exit(1);
        });
        websocket.on('close', () => {
            self._logger.log('closed');
            websocket.terminate();
            process.exit(1);
        });

        return websocket;
    }

    async connectWebsocket(websocket) {
        this._logger.log(`connectWebsocket ${websocket._url}`);
        // Create query to get all Tx event
        let queryTransaction = {
            jsonrpc: '2.0',
            method: 'subscribe',
            id: '0',
            params: {
                query: `tm.event='Tx' AND message.action='/cosmwasm.wasm.v1.MsgInstantiateContract'`,
            },
        };
        try {
            websocket.send(JSON.stringify(queryTransaction));
        } catch (error) {
            this._logger.error(error);
        }
    }

    /**
     * Get transaction listened from Websocket and dissect its data
     * @param message 
     */
    async handleMessage(message) {
        let buffer = Buffer.from(message);
        let response = JSON.parse(buffer.toString());
        console.log('Response result', response?.result)

        if (response?.result && Object.keys(response.result).length) {
            // Try to get message action
            let messageAction;
            try {
                messageAction = response.result.events['message.action'][0];
            } catch (error) {
                this._logger.error('Error get message action', error);
            }
            console.log('Listened a smart contract instantiate message')
            // Check if listened the right transaction
            if (messageAction === MESSAGE_ACTION.MSG_INSTANTIATE_CONTRACT) {
                let contract_address = response.result.events['instantiate._contract_address'][0] ?? '';
                let creator_address = response.result.events['message.sender'][0] ?? '';
                let height = response.result.events['tx.height'][0] ?? null;
                let code_id = response.result.events['instantiate.code_id'][0] ?? null;

                let paramGetHash = `/api/v1/smart-contract/get-hash/${code_id}`;
                let smartContractResponse;
                try {
                    smartContractResponse = await this._commonUtil.getDataAPI(this.smartContractService, paramGetHash);
                } catch (error) {
                    this._logger.error('Can not connect to smart contract verify service', error);
                }

                let contract_hash = '', contract_verification = SMART_CONTRACT_VERIFICATION.UNVERIFIED, contract_match, url;
                if(smartContractResponse.Message.length === 64) {
                    contract_hash = smartContractResponse.Message;
                }
                if(contract_hash !== '') {
                    let existContractHash = await this.smartContractRepository.findContractByHash(contract_hash);
                    if(existContractHash.filter(e => e.contract_verification == SMART_CONTRACT_VERIFICATION.EXACT_MATCH).length > 0) {
                        contract_verification = SMART_CONTRACT_VERIFICATION.SIMILAR_MATCH;
                        let exactContract = existContractHash.find(
                            (x) => x.contract_verification == SMART_CONTRACT_VERIFICATION.EXACT_MATCH
                        )
                        contract_match = exactContract.contract_address;
                        url = exactContract.url;
                    } 
                }

                let smartContract = {
                    height,
                    code_id,
                    contract_address,
                    creator_address,
                    contract_hash,
                    url,
                    contract_match,
                    contract_verification,
                }
                this._logger.log('insert to db');
                this._logger.debug(response);
                await this.smartContractRepository.create(smartContract);
                this._logger.log(response.result.events['tx.hash'][0], 'TxHash being synced');
            }
        }
    }

    sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}