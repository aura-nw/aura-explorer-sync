import { OnQueueActive, OnQueueCompleted, OnQueueError, OnQueueFailed, Process, Processor } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { CONST_CHAR, CONTRACT_CODE_RESULT, CONTRACT_TRANSACTION_EXECUTE_TYPE, CONTRACT_TYPE, NODE_API, SMART_CONTRACT_VERIFICATION } from "../common/constants/app.constant";
import { SmartContract } from "../entities";
import { SyncDataHelpers } from "../helpers/sync-data.helpers";
import { DeploymentRequestsRepository } from "../repositories/deployment-requests.repository";
import { SmartContractRepository } from "../repositories/smart-contract.repository";
import { ENV_CONFIG } from "../shared/services/config.service";
import { CommonUtil } from "../utils/common.util";
import * as util from 'util';
import { SmartContractCodeRepository } from "../repositories/smart-contract-code.repository";

@Processor('smart-contracts')
export class SmartContractsProcessor {
    private readonly logger = new Logger(SmartContractsProcessor.name);
    private rpc;
    private api;
    private smartContractService;
    private nodeEnv = ENV_CONFIG.NODE_ENV;

    constructor(
        private _commonUtil: CommonUtil,
        private smartContractRepository: SmartContractRepository,
        private deploymentRequestsRepository: DeploymentRequestsRepository,
        private smartContractCodeRepository: SmartContractCodeRepository
    ) {
        this.logger.log(
            '============== Constructor Smart Contracts Processor Service ==============',
        );

        this.rpc = ENV_CONFIG.NODE.RPC;
        this.api = ENV_CONFIG.NODE.API;

        this.smartContractService = ENV_CONFIG.SMART_CONTRACT_SERVICE;
    }

    @Process('sync-instantiate-contracts')
    async handleInstantiateContract(job: Job) {
        this.logger.log(job.data);
        let smartContracts = [];
        const txData = job.data.txData;
        try {
            const contract_name = txData.tx.body.messages[0].label;
            const height = txData.tx_response.height;
            const contract_address = txData.tx_response.logs[0].events
                .find(({ type }) => type === CONST_CHAR.INSTANTIATE)
                .attributes.find(
                    ({ key }) => key === CONST_CHAR._CONTRACT_ADDRESS,
                ).value;
            const creator_address = txData.tx.body.messages[0].sender;
            const code_id = txData.tx.body.messages[0].code_id;
            const tx_hash = txData.tx_response.txhash;

            let liquidityContractAddr;
            try {
                liquidityContractAddr = txData.tx_response.logs[0].events
                    .find(({ type }) => type === CONST_CHAR.WASM)
                    .attributes.find(
                        ({ key }) => key === CONST_CHAR.LIQUIDITY_TOKEN_ADDR,
                    ).value;
            } catch (error) {
                this.logger.log(
                    null,
                    `This transaction doesn't create a liquidity token`,
                );
            }
            if (liquidityContractAddr !== undefined) {
                const paramGetContract = `/cosmwasm/wasm/v1/contract/${liquidityContractAddr}`;
                let contractResponse = await this._commonUtil.getDataAPI(
                    this.api,
                    paramGetContract,
                );
                const liquidityCodeId = contractResponse.contract_info.code_id;
                const liquidityContractName = contractResponse.contract_info.label;
                const liquidityContractCreator = contractResponse.contract_info.creator;

                const liquidityContract = await this.makeInstantiateContractData(height, liquidityCodeId, liquidityContractName, liquidityContractAddr, liquidityContractCreator, tx_hash);
                smartContracts.push(liquidityContract);
            }

            const smartContract = await this.makeInstantiateContractData(height, code_id, contract_name, contract_address, creator_address, tx_hash);
            smartContracts.push(smartContract);
        } catch (error) {
            this.logger.error(
                null,
                `Got error in instantiate contract transaction`,
            );
            this.logger.error(null, `${error.stack}`);
        }

        if (smartContracts.length > 0) {
            smartContracts.map(async (smartContract) => {
                if (smartContract.contract_name == '') {
                    const param = `/cosmwasm/wasm/v1/contract/${smartContract.contract_address}`;
                    const contractData = await this._commonUtil.getDataAPI(
                        this.api,
                        param,
                    );
                    smartContract.contract_name = contractData.contract_info.label;
                    //update token info by code id
                    smartContract = await this.updateTokenInfoByCodeId(smartContract);
                }
            });
            const result = this.smartContractRepository.insertOnDuplicate(smartContracts, ['id']);
            this.logger.log(`Sync Instantiate Contract Result: ${result}`);
        }
    }

    @Process('sync-execute-contracts')
    async handleExecuteContract(job: Job) {
        this.logger.log(job.data);
        const txData = job.data.txData;
        const message = job.data.message;
        const smartContracts = [];
        try {
            const _smartContracts = SyncDataHelpers.makeExecuteContractData(
                txData,
                message,
            );
            for (let item of _smartContracts) {
                const smartContract = await this.makeInstantiateContractData(item.height, item.code_id, "", item.contract_address, item.creator_address, item.tx_hash);
                smartContracts.push(smartContract);
            };
        } catch (error) {
            this.logger.log(
                null,
                `Got error in execute contract transaction`,
            );
            this.logger.log(null, `${error.stack}`);
        }

        if (smartContracts.length > 0) {
            smartContracts.map(async (smartContract) => {
                if (smartContract.contract_name == '') {
                    const param = `/cosmwasm/wasm/v1/contract/${smartContract.contract_address}`;
                    const contractData = await this._commonUtil.getDataAPI(
                        this.api,
                        param,
                    );
                    smartContract.contract_name = contractData.contract_info.label;
                    //update token info by code id
                    smartContract = await this.updateTokenInfoByCodeId(smartContract);
                }
            });
            const result = this.smartContractRepository.insertOnDuplicate(smartContracts, ['id']);
            this.logger.log(`Sync Instantiate Contract Result: ${result}`);
        }
    }

    @OnQueueActive()
    onActive(job: Job) {
        this.logger.log(`Processing job ${job.id} of type ${job.name}...`);
    }

    @OnQueueCompleted()
    onComplete(job: Job, result: any) {
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
    onFailed(job: Job, error: Error) {
        this.logger.error(`Failed job ${job.id} of type ${job.name}`);
        this.logger.error(`Error: ${error}`);
    }

    async makeInstantiateContractData(height: string, code_id: string, contract_name: string, contract_address: string, creator_address: string, tx_hash: string) {
        let contract_hash = '',
            contract_verification = SMART_CONTRACT_VERIFICATION.UNVERIFIED,
            contract_match = '',
            url = '',
            compiler_version = '',
            instantiate_msg_schema = '',
            query_msg_schema = '',
            execute_msg_schema = '',
            s3_location = '',
            reference_code_id = 0;

        if (this.nodeEnv === 'mainnet') {
            const [request, existContracts] = await Promise.all([
                this.deploymentRequestsRepository.findByCondition({
                    mainnet_code_id: code_id,
                }),
                this.smartContractRepository.findByCondition({
                    code_id
                }),
            ])
            if (existContracts.length > 0) {
                contract_verification = SMART_CONTRACT_VERIFICATION.SIMILAR_MATCH;
                contract_match = existContracts[0].contract_address;
            }
            else contract_verification = SMART_CONTRACT_VERIFICATION.EXACT_MATCH;
            contract_hash = request[0].contract_hash;
            url = request[0].url;
            compiler_version = request[0].compiler_version;
            instantiate_msg_schema = request[0].instantiate_msg_schema;
            query_msg_schema = request[0].query_msg_schema;
            execute_msg_schema = request[0].execute_msg_schema;
            s3_location = request[0].s3_location;
            reference_code_id = request[0].euphoria_code_id;
        } else {
            const paramGetHash = `/api/v1/smart-contract/get-hash/${code_id}`;
            let smartContractResponse;
            try {
                smartContractResponse = await this._commonUtil.getDataAPI(
                    this.smartContractService,
                    paramGetHash,
                );
            } catch (error) {
                this.logger.error(
                    'Can not connect to smart contract verify service or LCD service',
                    error,
                );
            }

            if (smartContractResponse) {
                contract_hash =
                    smartContractResponse.Message.length === 64
                        ? smartContractResponse.Message
                        : '';
            }
            if (contract_hash !== '') {
                const exactContract =
                    await this.smartContractRepository.findExactContractByHash(
                        contract_hash,
                    );
                if (exactContract) {
                    contract_verification = SMART_CONTRACT_VERIFICATION.SIMILAR_MATCH;
                    contract_match = exactContract.contract_address;
                    url = exactContract.url;
                    compiler_version = exactContract.compiler_version;
                    instantiate_msg_schema = exactContract.instantiate_msg_schema;
                    query_msg_schema = exactContract.query_msg_schema;
                    execute_msg_schema = exactContract.execute_msg_schema;
                    s3_location = exactContract.s3_location;
                }
            }
        }

        const smartContract = new SmartContract();
        smartContract.id = 0;
        smartContract.height = Number(height);
        smartContract.code_id = Number(code_id);
        smartContract.contract_name = contract_name;
        smartContract.contract_address = contract_address;
        smartContract.creator_address = creator_address;
        smartContract.contract_hash = contract_hash;
        smartContract.tx_hash = tx_hash;
        smartContract.url = url;
        smartContract.instantiate_msg_schema = instantiate_msg_schema;
        smartContract.query_msg_schema = query_msg_schema;
        smartContract.execute_msg_schema = execute_msg_schema;
        smartContract.contract_match = contract_match;
        smartContract.contract_verification = contract_verification;
        smartContract.compiler_version = compiler_version;
        smartContract.s3_location = s3_location;
        smartContract.reference_code_id = reference_code_id.toString();
        smartContract.mainnet_upload_status = '';

        return smartContract;
    }

    async updateTokenInfoByCodeId(contract: any) {
        const contractCode = await this.smartContractCodeRepository.findOne({
            where: { code_id: contract.code_id }
        });
        if (contractCode && contractCode.type === CONTRACT_TYPE.CW721 && contractCode.result === CONTRACT_CODE_RESULT.CORRECT) {
            //get token info
            const base64RequestToken = Buffer.from(`{
                "contract_info": {}
            }`).toString('base64');
            const tokenInfo = await this._commonUtil.getDataContractFromBase64Query(this.api, contract.contract_address, base64RequestToken);
            //get num tokens
            const base64RequestNumToken = Buffer.from(`{
                "num_tokens": {}
            }`).toString('base64');
            const numTokenInfo = await this._commonUtil.getDataContractFromBase64Query(this.api, contract.contract_address, base64RequestNumToken);
            contract = SyncDataHelpers.makeTokenCW721Data(contract, tokenInfo, numTokenInfo);
        }

        return contract;
    }
}