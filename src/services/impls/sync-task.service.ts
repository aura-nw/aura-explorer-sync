import { Inject, Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { APP_CONSTANTS, CONST_CHAR, CONST_DELEGATE_TYPE, CONST_MSG_TYPE, CONST_PROPOSAL_TYPE, CONST_PUBKEY_ADDR, MESSAGE_ACTION, NODE_API, SMART_CONTRACT_VERIFICATION } from "../../common/constants/app.constant";
import { Block, BlockSyncError, MissedBlock, SyncStatus, Transaction, Validator } from "../../entities";
import { ConfigService } from "../../shared/services/config.service";
import { CommonUtil } from "../../utils/common.util";
import { ISyncTaskService } from "../isync-task.service";
import { InjectSchedule, Schedule } from 'nest-schedule';
import { v4 as uuidv4 } from 'uuid';
import { bech32 } from 'bech32';
import { sha256 } from 'js-sha256';
import { REPOSITORY_INTERFACE } from "../../module.config";
import { IValidatorRepository } from "../../repositories/ivalidator.repository";
import { InfluxDBClient } from "../../utils/influxdb-client";
import { IMissedBlockRepository } from "../../repositories/imissed-block.repository";
import { IBlockSyncErrorRepository } from "../../repositories/iblock-sync-error.repository";
import { IBlockRepository } from "../../repositories/iblock.repository";
import { ITransactionRepository } from "../../repositories/itransaction.repository";
import { ISyncStatusRepository } from "../../repositories/isync-status.repository";
import { IProposalDepositRepository } from "../../repositories/iproposal-deposit.repository";
import { IProposalVoteRepository } from "../../repositories/iproposal-vote.repository";
import { ProposalVote } from "../../entities/proposal-vote.entity";
import { HistoryProposal } from "../../entities/history-proposal.entity";
import { IHistoryProposalRepository } from "../../repositories/ihistory-proposal.repository";
import { IDelegationRepository } from "../../repositories/idelegation.repository";
import { ProposalDeposit } from "../../entities/proposal-deposit.entity";
import { Delegation } from "../../entities/delegation.entity";
import { DelegatorReward } from "../../entities/delegator-reward.entity";
import { IDelegatorRewardRepository } from "../../repositories/idelegator-reward.repository";
import e from "express";
import { ISmartContractRepository } from "src/repositories/ismart-contract.repository";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { ITokenContractRepository } from "src/repositories/itoken-contract.repository";
import { loadavg } from "os";

@Injectable()
export class SyncTaskService implements ISyncTaskService {
    private readonly _logger = new Logger(SyncTaskService.name);
    private rpc;
    private api;
    private influxDbClient: InfluxDBClient;
    private isSyncing = false;
    private isSyncValidator = false;
    private isSyncMissBlock = false;
    private currentBlock: number;
    private threads = 0;
    private schedulesSync: Array<number> = [];
    private smartContractService;

    constructor(
        private configService: ConfigService,
        private _commonUtil: CommonUtil,
        @Inject(REPOSITORY_INTERFACE.IVALIDATOR_REPOSITORY)
        private validatorRepository: IValidatorRepository,
        @Inject(REPOSITORY_INTERFACE.IMISSED_BLOCK_REPOSITORY)
        private missedBlockRepository: IMissedBlockRepository,
        @Inject(REPOSITORY_INTERFACE.IBLOCK_SYNC_ERROR_REPOSITORY)
        private blockSyncErrorRepository: IBlockSyncErrorRepository,
        @Inject(REPOSITORY_INTERFACE.IBLOCK_REPOSITORY)
        private blockRepository: IBlockRepository,
        @Inject(REPOSITORY_INTERFACE.ITRANSACTION_REPOSITORY)
        private txRepository: ITransactionRepository,
        @Inject(REPOSITORY_INTERFACE.ISYNC_STATUS_REPOSITORY)
        private statusRepository: ISyncStatusRepository,
        @Inject(REPOSITORY_INTERFACE.IPROPOSAL_DEPOSIT_REPOSITORY)
        private proposalDepositRepository: IProposalDepositRepository,
        @Inject(REPOSITORY_INTERFACE.IPROPOSAL_VOTE_REPOSITORY)
        private proposalVoteRepository: IProposalVoteRepository,
        @Inject(REPOSITORY_INTERFACE.IHISTORY_PROPOSAL_REPOSITORY)
        private historyProposalRepository: IHistoryProposalRepository,
        @Inject(REPOSITORY_INTERFACE.IDELEGATION_REPOSITORY)
        private delegationRepository: IDelegationRepository,
        @Inject(REPOSITORY_INTERFACE.IDELEGATOR_REWARD_REPOSITORY)
        private delegatorRewardRepository: IDelegatorRewardRepository,
        @Inject(REPOSITORY_INTERFACE.ISMART_CONTRACT_REPOSITORY)
        private smartContractRepository: ISmartContractRepository,
        @Inject(REPOSITORY_INTERFACE.ITOKEN_CONTRACT_REPOSITORY)
        private tokenContractRepository: ITokenContractRepository,
        @InjectSchedule() private readonly schedule: Schedule
    ) {
        this._logger.log(
            '============== Constructor Sync Task Service ==============',
        );
        this.rpc = this.configService.get('RPC');
        this.api = this.configService.get('API');

        this.influxDbClient = new InfluxDBClient(
            this.configService.get('INFLUXDB_BUCKET'),
            this.configService.get('INFLUXDB_ORG'),
            this.configService.get('INFLUXDB_URL'),
            this.configService.get('INFLUXDB_TOKEN'),
        );

        this.smartContractService = this.configService.get('SMART_CONTRACT_SERVICE');

        // Get number thread from config
        this.threads = Number(this.configService.get('THREADS') || 15);

        // Call worker to process
        this.workerProcess();
    }

    /**
     * scheduleTimeoutJob
     * @param height 
     */
    scheduleTimeoutJob(height: number) {
        this._logger.log(null, `Class ${SyncTaskService.name}, call scheduleTimeoutJob method with prameters: {currentBlk: ${height}}`);

        this.schedule.scheduleTimeoutJob(`schedule_sync_block_${uuidv4()}`, 100, async () => {
            //Update code sync data
            await this.handleSyncData(height);

            // Close thread
            return true;
        });
    }

    /**
    * threadProcess
    * @param currentBlk Current block
    * @param blockLatest The final block
    */
    threadProcess(currentBlk: number, latestBlk: number) {
        let loop = 0;
        let height = 0;
        try {
            let blockNotSync = latestBlk - currentBlk;
            if (blockNotSync > 0) {
                if (blockNotSync > this.threads) {
                    loop = this.threads;
                } else {
                    loop = blockNotSync;
                }

                // Create 10 thread to sync data      
                for (let i = 1; i <= loop; i++) {
                    height = currentBlk + i;
                    this.scheduleTimeoutJob(height);
                }
            }
        } catch (error) {
            this._logger.log(null, `Call threadProcess method error: $${error.message}`);
        }

        // If current block not equal latest block when the symtem will call workerProcess method    
        this.schedule.scheduleIntervalJob(`schedule_recall_${(new Date()).getTime()}`, 1000, async () => {
            // Update code sync data
            this._logger.log(null, `Class ${SyncTaskService.name}, recall workerProcess method`);
            this.workerProcess(height);

            // Close thread
            return true;
        });
    }

    /**
     * workerProcess
     * @param height
     */
    async workerProcess(height: number = undefined) {

        this._logger.log(null, `Class ${SyncTaskService.name}, call workerProcess method`);

        let currentBlk = 0, latestBlk = 0;
        // Get blocks latest
        try {
            const blockLatest = await this.getBlockLatest();
            latestBlk = Number(blockLatest?.block?.header?.height || 0);

            if (height > 0) {
                currentBlk = height;

            } else {
                //Get current height
                const status = await this.statusRepository.findOne();
                if (status) {
                    currentBlk = status.current_block;
                }
            }
        } catch (err) { }

        this.threadProcess(currentBlk, latestBlk)
    }

    @Interval(500)
    async syncValidator() {
        // check status
        if (this.isSyncValidator) {
            this._logger.log(null, 'already syncing validator... wait');
            return;
        } else {
            this._logger.log(null, 'fetching data validator...');
        }

        this.influxDbClient.initWriteApi();

        // get validators
        const paramsValidator = NODE_API.VALIDATOR;
        // get staking pool
        const paramspool = NODE_API.STAKING_POOL;
        // get slashing param
        const paramsSlashing = NODE_API.SLASHING_PARAM;
        // get slashing signing info
        const paramsSigning = NODE_API.SIGNING_INFOS;

        const [validatorData, poolData, slashingData, signingData]
            = await Promise.all([
                this._commonUtil.getDataAPI(this.api, paramsValidator),
                this._commonUtil.getDataAPI(this.api, paramspool),
                this._commonUtil.getDataAPI(this.api, paramsSlashing),
                this._commonUtil.getDataAPI(this.api, paramsSigning)
            ])

        if (validatorData) {
            this.isSyncValidator = true;
            for (let key in validatorData.validators) {
                const data = validatorData.validators[key];
                // get account address
                const operator_address = data.operator_address;
                const decodeAcc = bech32.decode(operator_address, 1023);
                const wordsByte = bech32.fromWords(decodeAcc.words);
                const account_address = bech32.encode(CONST_PUBKEY_ADDR.AURA, bech32.toWords(wordsByte));
                // get validator detail
                const validatorUrl = `staking/validators/${data.operator_address}`;
                const validatorResponse = await this._commonUtil.getDataAPI(this.api, validatorUrl);

                try {
                    // create validator
                    const newValidator = new Validator();
                    newValidator.operator_address = data.operator_address;
                    newValidator.acc_address = account_address;
                    newValidator.cons_address = this._commonUtil.getAddressFromPubkey(data.consensus_pubkey.key);
                    newValidator.cons_pub_key = data.consensus_pubkey.key;
                    newValidator.title = data.description.moniker;
                    newValidator.jailed = data.jailed;
                    newValidator.commission = Number(data.commission.commission_rates.rate).toFixed(2);
                    newValidator.max_commission = data.commission.commission_rates.max_rate;
                    newValidator.max_change_rate = data.commission.commission_rates.max_change_rate;
                    newValidator.min_self_delegation = data.min_self_delegation;
                    newValidator.delegator_shares = data.delegator_shares;
                    newValidator.power = Number(data.tokens);
                    newValidator.website = data.description.website;
                    newValidator.details = data.description.details;
                    newValidator.identity = data.description.identity;
                    newValidator.unbonding_height = data.unbonding_height;
                    newValidator.unbonding_time = data.unbonding_time;
                    newValidator.update_time = data.commission.update_time;
                    newValidator.status = Number(validatorResponse.result?.status) || 0;
                    const percentPower = (data.tokens / poolData.pool.bonded_tokens) * 100;
                    newValidator.percent_power = percentPower.toFixed(2);
                    const pubkey = this._commonUtil.getAddressFromPubkey(data.consensus_pubkey.key);
                    const address = this._commonUtil.hexToBech32(pubkey, CONST_PUBKEY_ADDR.AURAVALCONS);
                    const signingInfo = signingData.info.filter(e => e.address === address);
                    if (signingInfo.length > 0) {
                        const signedBlocksWindow = slashingData.params.signed_blocks_window;
                        const missedBlocksCounter = signingInfo[0].missed_blocks_counter;
                        newValidator.up_time = (signedBlocksWindow - missedBlocksCounter) / signedBlocksWindow * 100 + CONST_CHAR.PERCENT;
                    }
                    newValidator.self_bonded = 0;
                    newValidator.percent_self_bonded = '0.00';
                    try {
                        // get delegations
                        const paramDelegation = `cosmos/staking/v1beta1/validators/${data.operator_address}/delegations/${account_address}`;
                        const delegationData = await this._commonUtil.getDataAPI(this.api, paramDelegation);
                        if (delegationData && delegationData.delegation_response) {
                            newValidator.self_bonded = delegationData.delegation_response.balance.amount;
                            const percentSelfBonded = (delegationData.delegation_response.balance.amount / data.tokens) * 100;
                            newValidator.percent_self_bonded = percentSelfBonded.toFixed(2) + CONST_CHAR.PERCENT;
                        }
                    } catch (error) {
                        this._logger.error(null, `Not exist delegations`);
                    }
                    const validatorFilter = await this.validatorRepository.findOne({ where: { operator_address: data.operator_address } });
                    if (validatorFilter) {
                        this.syncUpdateValidator(newValidator, validatorFilter);
                    } else {
                        await this.validatorRepository.create(newValidator);
                    }
                    // TODO: Write validator to influxdb
                    this.influxDbClient.writeValidator(
                        newValidator.operator_address,
                        newValidator.title,
                        newValidator.jailed,
                        newValidator.power,
                    );

                    this.isSyncValidator = false;
                } catch (error) {
                    this.isSyncValidator = false;
                    this._logger.error(null, `${error.name}: ${error.message}`);
                    this._logger.error(null, `${error.stack}`);
                }
            }
        }
    }

    async syncUpdateValidator(newValidator, validatorData) {
        let isSave = false;

        if (validatorData.title !== newValidator.title) {
            validatorData.title = newValidator.title;
            isSave = true;
        }

        if (validatorData.jailed !== newValidator.jailed) {
            validatorData.jailed = newValidator.jailed;
            isSave = true;
        }

        if (validatorData.commission !== newValidator.commission) {
            validatorData.commission = newValidator.commission;
            isSave = true;
        }

        if (validatorData.power !== Number(newValidator.power)) {
            validatorData.power = Number(newValidator.power);
            isSave = true;
        }

        if (validatorData.percent_power !== newValidator.percent_power) {
            validatorData.percent_power = newValidator.percent_power;
            isSave = true;
        }

        if (validatorData.self_bonded !== Number(newValidator.self_bonded)) {
            validatorData.self_bonded = newValidator.self_bonded;
            isSave = true;
        }

        if (validatorData.percent_self_bonded !== newValidator.percent_self_bonded) {
            validatorData.percent_self_bonded = newValidator.percent_self_bonded;
            isSave = true;
        }

        if (validatorData.website !== newValidator.website) {
            validatorData.website = newValidator.website;
            isSave = true;
        }

        if (validatorData.details !== newValidator.details) {
            validatorData.details = newValidator.details;
            isSave = true;
        }

        if (validatorData.identity !== newValidator.identity) {
            validatorData.identity = newValidator.identity;
            isSave = true;
        }

        if (validatorData.unbonding_height !== newValidator.unbonding_height) {
            validatorData.unbonding_height = newValidator.unbonding_height;
            isSave = true;
        }

        if (validatorData.up_time !== newValidator.up_time) {
            validatorData.up_time = newValidator.up_time;
            isSave = true;
        }

        if (validatorData.status !== newValidator.status) {
            validatorData.status = newValidator.status;
            isSave = true;
        }

        if (isSave) {
            newValidator.id = validatorData.id;
            this.validatorRepository.update(validatorData);
        }
    }

    @Interval(500)
    async syncMissedBlock() {
        // check status
        if (this.isSyncMissBlock) {
            this._logger.log(null, 'already syncing validator... wait');
            return;
        } else {
            this._logger.log(null, 'fetching data validator...');
        }

        try {
            // get blocks latest
            const paramsBlockLatest = NODE_API.LATEST_BLOCK;
            const blockLatestData = await this._commonUtil.getDataAPI(this.api, paramsBlockLatest);

            if (blockLatestData) {
                this.isSyncMissBlock = true;

                const heightLatest = blockLatestData.block.header.height;
                // get block by height
                const paramsBlock = `blocks/${heightLatest}`;
                // get validatorsets
                const paramsValidatorsets = `cosmos/base/tendermint/v1beta1/validatorsets/${heightLatest}`;

                const [blockData, validatorsetsData] = await Promise.all([
                    this._commonUtil.getDataAPI(this.api, paramsBlock),
                    this._commonUtil.getDataAPI(this.api, paramsValidatorsets)
                ])

                if (validatorsetsData) {

                    for (let key in validatorsetsData.validators) {
                        const data = validatorsetsData.validators[key];
                        const address = this._commonUtil.getAddressFromPubkey(data.pub_key.key);

                        if (blockData) {
                            const signingInfo = blockData.block.last_commit.signatures.filter(e => e.validator_address === address);
                            if (signingInfo.length <= 0) {

                                // create missed block
                                const newMissedBlock = new MissedBlock();
                                newMissedBlock.height = blockData.block.header.height;
                                newMissedBlock.validator_address = address;
                                newMissedBlock.timestamp = blockData.block.header.time;

                                // insert into table missed-block
                                try {
                                    await this.missedBlockRepository.create(newMissedBlock);
                                    // TODO: Write missed block to influxdb
                                    this.influxDbClient.writeMissedBlock(
                                        newMissedBlock.validator_address,
                                        newMissedBlock.height,
                                    );
                                } catch (error) {
                                    this._logger.error(null, `Missed is already existed!`);
                                }

                            }
                        }
                    }
                }
            }
            this.isSyncMissBlock = false;
        } catch (error) {
            this.isSyncMissBlock = false;
            this._logger.error(null, `${error.name}: ${error.message}`);
            this._logger.error(null, `${error.stack}`);
        }
    }

    @Interval(2000)
    async blockSyncError() {
        const result: BlockSyncError = await this.blockSyncErrorRepository.findOne();
        if (result) {
            const idxSync = this.schedulesSync.indexOf(result.height);

            // Check height has sync or not. If height hasn't sync when we recall handleSyncData method
            if (idxSync < 0) {
                await this.handleSyncData(result.height, true);
                this.schedulesSync.splice(idxSync, 1);
            }
        }
    }

    async handleSyncData(syncBlock: number, recallSync = false): Promise<any> {
        this._logger.log(null, `Class ${SyncTaskService.name}, call handleSyncData method with prameters: {syncBlock: ${syncBlock}}`);
        // this.logger.log(null, `Already syncing Block: ${syncBlock}`);

        // TODO: init write api
        this.influxDbClient.initWriteApi();

        // get validators
        const paramsValidator = NODE_API.VALIDATOR;
        const validatorData = await this._commonUtil.getDataAPI(this.api, paramsValidator);
        const fetchingBlockHeight = syncBlock;

        try {
            // fetching block from node
            const paramsBlock = `block?height=${fetchingBlockHeight}`;
            const blockData = await this._commonUtil.getDataRPC(this.rpc, paramsBlock);

            // create block
            const newBlock = new Block();
            newBlock.block_hash = blockData.block_id.hash;
            newBlock.chainid = blockData.block.header.chain_id;
            newBlock.height = blockData.block.header.height;
            newBlock.num_txs = blockData.block.data.txs.length;
            newBlock.timestamp = blockData.block.header.time;
            newBlock.round = blockData.block.last_commit.round;
            newBlock.json_data = JSON.stringify(blockData);

            const operatorAddress = blockData.block.header.proposer_address;
            let blockGasUsed = 0;
            let blockGasWanted = 0;

            //Insert block error table
            if (!recallSync) {
                await this.insertBlockError(newBlock.block_hash, newBlock.height);

                // Mark schedule is running
                this.schedulesSync.push(Number(newBlock.height));
            }

            // set proposer and operator_address from validators
            for (let key in validatorData.validators) {
                const ele = validatorData.validators[key];
                const pubkey = this._commonUtil.getAddressFromPubkey(ele.consensus_pubkey.key);
                if (pubkey === operatorAddress) {
                    newBlock.proposer = ele.description.moniker;
                    newBlock.operator_address = ele.operator_address;
                }
            }

            if (blockData.block.data.txs && blockData.block.data.txs.length > 0) {
                let transactions = [];
                let listTransactions = [];
                const influxdbTrans = [];
                // create transaction
                for (let key in blockData.block.data.txs) {
                    const element = blockData.block.data.txs[key];

                    const txHash = sha256(Buffer.from(element, 'base64')).toUpperCase();
                    this._logger.log(null, `processing tx: ${txHash}`);

                    // fetch tx data
                    const paramsTx = `cosmos/tx/v1beta1/txs/${txHash}`;

                    const txData = await this._commonUtil.getDataAPI(this.api, paramsTx);

                    let txType = 'FAILED', txRawLogData, txContractAddress;
                    if (txData.tx_response.code === 0) {
                        const txLog = JSON.parse(txData.tx_response.raw_log);

                        const txAttr = txLog[0].events.find(
                            ({ type }) => type === CONST_CHAR.MESSAGE,
                        );
                        const txAction = txAttr.attributes.find(
                            ({ key }) => key === CONST_CHAR.ACTION,
                        );
                        const regex = /_/gi;
                        txType = txAction.value.replace(regex, ' ');

                        const txMsgType = txType.substring(txType.lastIndexOf('.') + 1);
                        if (txMsgType == CONST_MSG_TYPE.MSG_WITHDRAW_DELEGATOR_REWARD) {
                            let amount = txData.tx_response.logs[0].events.find(
                                ({ type }) => type === CONST_CHAR.WITHDRAW_REWARDS,
                            );
                            amount.attributes = amount.attributes.filter((x) => x.key == CONST_CHAR.AMOUNT);
                            txRawLogData = JSON.stringify(amount);
                        } else if (txMsgType == CONST_MSG_TYPE.MSG_DELEGATE || txMsgType == CONST_MSG_TYPE.MSG_REDELEGATE || txMsgType == CONST_MSG_TYPE.MSG_UNDELEGATE) {
                            let amount = txData.tx_response.tx.body.messages[0].amount;
                            let reward;
                            try {
                                reward = txData.tx_response.logs[0].events.find(
                                    ({ type }) => type === CONST_CHAR.TRANSFER,
                                ).attributes.filter((x) => x.key == CONST_CHAR.AMOUNT);
                            } catch (error) {
                                reward = 0;
                            }
                            const rawData = {
                                amount,
                                reward
                            };
                            txRawLogData = JSON.stringify(rawData);
                        } else if (txMsgType == CONST_MSG_TYPE.MSG_INSTANTIATE_CONTRACT) {
                            try {
                                let contract_name = txData.tx.body.messages[0].label;
                                let height = txData.tx_response.height;
                                let contract_address = txData.tx_response.logs[0].events.find(
                                    ({ type }) => type === CONST_CHAR.INSTANTIATE,
                                ).attributes.find(
                                    ({ key }) => key === CONST_CHAR._CONTRACT_ADDRESS,
                                ).value;
                                txContractAddress = contract_address;
                                let creator_address = txData.tx.body.messages[0].sender;
                                let code_id = txData.tx.body.messages[0].code_id;
                                let tx_hash = txData.tx_response.txhash;

                                let paramGetHash = `/api/v1/smart-contract/get-hash/${code_id}`;
                                let paramConstructor = `/cosmwasm/wasm/v1/contract/${contract_address}/history`;
                                let smartContractResponse, lcdResponse;
                                try {
                                    [smartContractResponse, lcdResponse] = await Promise.all([
                                        this._commonUtil.getDataAPI(this.smartContractService, paramGetHash),
                                        this._commonUtil.getDataAPI(this.api, paramConstructor),
                                    ]);
                                } catch (error) {
                                    this._logger.error('Can not connect to smart contract verify service or LCD service', error);
                                }

                                let contract_hash = '', contract_verification = SMART_CONTRACT_VERIFICATION.UNVERIFIED, contract_match, url, compiler_version;
                                if (smartContractResponse) {
                                    contract_hash = smartContractResponse.Message.length === 64 ? smartContractResponse.Message : '';
                                }
                                if (contract_hash !== '') {
                                    let existContractHash = await this.smartContractRepository.findContractByHash(contract_hash);
                                    if (existContractHash.filter(e => e.contract_verification == SMART_CONTRACT_VERIFICATION.EXACT_MATCH).length > 0) {
                                        contract_verification = SMART_CONTRACT_VERIFICATION.SIMILAR_MATCH;
                                        let exactContract = existContractHash.find(
                                            (x) => x.contract_verification == SMART_CONTRACT_VERIFICATION.EXACT_MATCH
                                        )
                                        contract_match = exactContract.contract_address;
                                        url = exactContract.url;
                                        compiler_version = exactContract.compiler_version;
                                    }
                                }

                                let tokenContract, token_name, token_symbol, token_decimal, token_image, token_description, max_total_supply;
                                if (lcdResponse) {
                                    let msg = lcdResponse.entries[0].msg;
                                    try {
                                        const client = await SigningCosmWasmClient.connect(this.rpc);
                                        var queryMsg = {
                                            "token_info": {}
                                        };
                                        let resultQuery = await client.queryContractSmart(contract_address, queryMsg);

                                        token_name = msg.name;
                                        token_decimal = msg.decimals;
                                        token_symbol = msg.symbol;
                                        max_total_supply = resultQuery.total_supply;
                                        try {
                                            token_image = msg.marketing.logo.url ?? '';
                                            token_description = msg.marketing.description ?? '';
                                        } catch (error) {
                                            this._logger.error('Can not get image and description of token', error);
                                        }
                                        tokenContract = {
                                            name: token_name,
                                            symbol: token_symbol,
                                            image: token_image,
                                            description: token_description,
                                            contract_address,
                                            decimal: token_decimal,
                                            max_total_supply,
                                        }
                                    } catch (error) {
                                        this._logger.error('This is not a CW20 contract', error);
                                    }
                                }

                                let smartContract = {
                                    height,
                                    code_id,
                                    contract_name,
                                    contract_address,
                                    creator_address,
                                    contract_hash,
                                    tx_hash,
                                    url,
                                    contract_match,
                                    contract_verification,
                                    compiler_version,
                                }

                                tokenContract ?
                                    await Promise.all([
                                        this.smartContractRepository.create(smartContract),
                                        this.tokenContractRepository.create(tokenContract)
                                    ]) :
                                    await this.smartContractRepository.create(smartContract);
                            } catch (error) {
                                this._logger.error(null, `Got error instantiate contract transaction`);
                                this._logger.error(null, `${error.stack}`);
                            }
                        } else if (txMsgType == CONST_MSG_TYPE.MSG_EXECUTE_CONTRACT) {
                            txContractAddress = txData.tx.body.messages[0].contract;
                        }
                    } else {
                        const txBody = txData.tx_response.tx.body.messages[0];
                        txType = txBody['@type'];
                    }
                    const newTx = new Transaction();
                    const fee = txData.tx_response.tx.auth_info.fee.amount[0];
                    const txFee = (fee[CONST_CHAR.AMOUNT] / APP_CONSTANTS.PRECISION_DIV).toFixed(6);
                    // newTx.blockId = savedBlock.id;
                    newTx.code = txData.tx_response.code;
                    newTx.codespace = txData.tx_response.codespace;
                    newTx.data =
                        txData.tx_response.code === 0 ? txData.tx_response.data : '';
                    newTx.gas_used = txData.tx_response.gas_used;
                    newTx.gas_wanted = txData.tx_response.gas_wanted;
                    newTx.height = fetchingBlockHeight;
                    newTx.info = txData.tx_response.info;
                    newTx.raw_log = txData.tx_response.raw_log;
                    newTx.raw_log_data = txRawLogData ?? null;
                    newTx.timestamp = blockData.block.header.time;
                    newTx.tx = JSON.stringify(txData.tx_response);
                    newTx.tx_hash = txData.tx_response.txhash;
                    newTx.type = txType;
                    newTx.fee = txFee;
                    newTx.messages = txData.tx_response.tx.body.messages;
                    newTx.contract_address = txContractAddress;
                    transactions.push(newTx);

                    // Push data to array, it's insert data to Influxd db
                    influxdbTrans.push({
                        tx_hash: newTx.tx_hash,
                        height: newTx.height,
                        type: newTx.type,
                        timestamp: newTx.timestamp
                    });

                    // check to push into list transaction
                    const txTypeCheck = txType.substring(txType.lastIndexOf('.') + 1);
                    if (txData.tx_response.code === 0 && (<any>Object).values(CONST_MSG_TYPE).includes(txTypeCheck)) {
                        listTransactions.push(txData);
                    }
                    blockGasUsed += parseInt(txData.tx_response.gas_used);
                    blockGasWanted += parseInt(txData.tx_response.gas_wanted);
                }

                // Insert data to Block table
                newBlock.gas_used = blockGasUsed;
                newBlock.gas_wanted = blockGasWanted;
                const savedBlock = await this.blockRepository.upsert([newBlock], []);
                if (savedBlock) {
                    transactions.map((item) => item.blockId = savedBlock[0].id);
                    await this.txRepository.upsert(transactions, []);
                }

                //sync data with transactions
                if (listTransactions.length > 0) {
                    // TODO: Write tx to influxdb
                    this.influxDbClient.writeTxs([...influxdbTrans]);

                    await this.syncDataWithTransactions(listTransactions);
                }
            } else {
                //Insert or update Block
                await this.blockRepository.upsert([newBlock], []);
            }

            // TODO: Write block to influxdb
            this.influxDbClient.writeBlock(
                newBlock.height,
                newBlock.block_hash,
                newBlock.num_txs,
                newBlock.chainid,
                newBlock.timestamp,
                newBlock.proposer
            );

            /**
             * TODO: Flush pending writes and close writeApi.
             */
            // this.influxDbClient.closeWriteApi();

            // Update current block
            let currentBlk = 0;
            const status = await this.statusRepository.findOne();
            if (status) {
                currentBlk = status.current_block;
            }

            if (syncBlock > currentBlk) {
                await this.updateStatus(fetchingBlockHeight);
            }

            // Delete data on Block sync error table
            await this.removeBlockError(syncBlock);

            const idxSync = this.schedulesSync.indexOf(fetchingBlockHeight);
            if (idxSync > (-1)) {
                this.schedulesSync.splice(idxSync, 1);
            }

        } catch (error) {
            this._logger.error(null, `Sync Blocked & Transaction were error, ${error.name}: ${error.message}`);
            this._logger.error(null, `${error.stack}`);

            const idxSync = this.schedulesSync.indexOf(fetchingBlockHeight);
            if (idxSync > (-1)) {
                this.schedulesSync.splice(idxSync, 1);
            }
            throw new Error(error);
        }
    }

    async syncDataWithTransactions(listTransactions) {
        let proposalVotes = [];
        let proposalDeposits = [];
        let historyProposals = [];
        let delegations = [];
        let delegatorRewards = [];
        for (let k = 0; k < listTransactions.length; k++) {
            const txData = listTransactions[k];
            if (txData.tx.body.messages && txData.tx.body.messages.length > 0
                && txData.tx.body.messages.length === txData.tx_response.logs.length) {
                for (let i = 0; i < txData.tx.body.messages.length; i++) {
                    const message: any = txData.tx.body.messages[i];
                    //check type to sync data
                    const txTypeReturn = message['@type'];
                    const txType = txTypeReturn.substring(txTypeReturn.lastIndexOf('.') + 1);
                    if (txType === CONST_MSG_TYPE.MSG_VOTE) {
                        let proposalVote = new ProposalVote();
                        proposalVote.proposal_id = Number(message.proposal_id);
                        proposalVote.voter = message.voter;
                        proposalVote.tx_hash = txData.tx_response.txhash;
                        proposalVote.option = message.option;
                        proposalVote.created_at = new Date(txData.tx_response.timestamp);
                        proposalVote.updated_at = new Date(txData.tx_response.timestamp);
                        proposalVotes.push(proposalVote);
                    } else if (txType === CONST_MSG_TYPE.MSG_SUBMIT_PROPOSAL) {
                        let historyProposal = new HistoryProposal();
                        const proposalTypeReturn = message.content['@type'];
                        const proposalType = proposalTypeReturn.substring(proposalTypeReturn.lastIndexOf('.') + 1);
                        historyProposal.proposal_id = 0;
                        if (txData.tx_response.logs && txData.tx_response.logs.length > 0
                            && txData.tx_response.logs[i].events && txData.tx_response.logs[i].events.length > 0) {
                            const events = txData.tx_response.logs[i].events;
                            const submitEvent = events.find(i => i.type === 'submit_proposal');
                            const attributes = submitEvent.attributes;
                            const findId = attributes.find(i => i.key === 'proposal_id');
                            historyProposal.proposal_id = Number(findId.value);
                        }
                        historyProposal.recipient = '';
                        historyProposal.amount = 0;
                        historyProposal.initial_deposit = 0;
                        if (proposalType === CONST_PROPOSAL_TYPE.COMMUNITY_POOL_SPEND_PROPOSAL) {
                            historyProposal.recipient = message.content.recipient;
                            historyProposal.amount = Number(message.content.amount[0].amount);
                        } else {
                            if (message.initial_deposit.length > 0) {
                                historyProposal.initial_deposit = Number(message.initial_deposit[0].amount);
                                //save data to proposal deposit
                                let proposalDeposit = new ProposalDeposit();
                                proposalDeposit.proposal_id = historyProposal.proposal_id;
                                proposalDeposit.tx_hash = txData.tx_response.txhash;
                                proposalDeposit.depositor = message.proposer;
                                proposalDeposit.amount = Number(message.initial_deposit[0].amount);
                                proposalDeposit.created_at = new Date(txData.tx_response.timestamp);
                                proposalDeposits.push(proposalDeposit);
                            }
                        }
                        historyProposal.tx_hash = txData.tx_response.txhash;
                        historyProposal.title = message.content.title;
                        historyProposal.description = message.content.description;
                        historyProposal.proposer = message.proposer;
                        historyProposal.created_at = new Date(txData.tx_response.timestamp);
                        historyProposals.push(historyProposal);
                    } else if (txType === CONST_MSG_TYPE.MSG_DEPOSIT) {
                        let proposalDeposit = new ProposalDeposit();
                        proposalDeposit.proposal_id = Number(message.proposal_id);
                        proposalDeposit.tx_hash = txData.tx_response.txhash;
                        proposalDeposit.depositor = message.depositor;
                        proposalDeposit.amount = Number(message.amount[0].amount);
                        proposalDeposit.created_at = new Date(txData.tx_response.timestamp);
                        proposalDeposits.push(proposalDeposit);
                    } else if (txType === CONST_MSG_TYPE.MSG_DELEGATE) {
                        let delegation = new Delegation();
                        delegation.tx_hash = txData.tx_response.txhash;
                        delegation.delegator_address = message.delegator_address;
                        delegation.validator_address = message.validator_address;
                        delegation.amount = Number(message.amount.amount) / APP_CONSTANTS.PRECISION_DIV;
                        delegation.created_at = new Date(txData.tx_response.timestamp);
                        delegation.type = CONST_DELEGATE_TYPE.DELEGATE;
                        delegations.push(delegation);
                        //save data to delegator_rewards table
                        let reward = new DelegatorReward();
                        reward.delegator_address = message.delegator_address;
                        reward.validator_address = message.validator_address;
                        reward.amount = 0;
                        if (txData.tx_response.logs && txData.tx_response.logs.length > 0
                            && txData.tx_response.logs[i].events && txData.tx_response.logs[i].events.length > 0) {
                            const events = txData.tx_response.logs[i].events;
                            const claimEvent = events.find(i => i.type === 'transfer');
                            if (claimEvent) {
                                const attributes = claimEvent.attributes;
                                reward.amount = Number(attributes[2].value.replace(CONST_CHAR.UAURA, ''));
                            }
                        }
                        reward.tx_hash = txData.tx_response.txhash;
                        delegatorRewards.push(reward);
                    } else if (txType === CONST_MSG_TYPE.MSG_UNDELEGATE) {
                        let delegation = new Delegation();
                        delegation.tx_hash = txData.tx_response.txhash;
                        delegation.delegator_address = message.delegator_address;
                        delegation.validator_address = message.validator_address;
                        delegation.amount = (Number(message.amount.amount) * (-1)) / APP_CONSTANTS.PRECISION_DIV;
                        delegation.created_at = new Date(txData.tx_response.timestamp);
                        delegation.type = CONST_DELEGATE_TYPE.UNDELEGATE;
                        delegations.push(delegation);
                        //save data to delegator_rewards table
                        let reward = new DelegatorReward();
                        reward.delegator_address = message.delegator_address;
                        reward.validator_address = message.validator_address;
                        reward.amount = 0;
                        if (txData.tx_response.logs && txData.tx_response.logs.length > 0
                            && txData.tx_response.logs[i].events && txData.tx_response.logs[i].events.length > 0) {
                            const events = txData.tx_response.logs[i].events;
                            const claimEvent = events.find(i => i.type === 'transfer');
                            if (claimEvent) {
                                const attributes = claimEvent.attributes;
                                reward.amount = Number(attributes[2].value.replace(CONST_CHAR.UAURA, ''));
                            }
                        }
                        reward.tx_hash = txData.tx_response.txhash;
                        delegatorRewards.push(reward);
                    } else if (txType === CONST_MSG_TYPE.MSG_REDELEGATE) {
                        let delegation1 = new Delegation();
                        delegation1.tx_hash = txData.tx_response.txhash;
                        delegation1.delegator_address = message.delegator_address;
                        delegation1.validator_address = message.validator_src_address;
                        delegation1.amount = (Number(message.amount.amount) * (-1)) / APP_CONSTANTS.PRECISION_DIV;
                        delegation1.created_at = new Date(txData.tx_response.timestamp);
                        delegation1.type = CONST_DELEGATE_TYPE.REDELEGATE;
                        let delegation2 = new Delegation();
                        delegation2.tx_hash = txData.tx_response.txhash;
                        delegation2.delegator_address = message.delegator_address;
                        delegation2.validator_address = message.validator_dst_address;
                        delegation2.amount = Number(message.amount.amount) / APP_CONSTANTS.PRECISION_DIV;
                        delegation2.created_at = new Date(txData.tx_response.timestamp);
                        delegation2.type = CONST_DELEGATE_TYPE.REDELEGATE;
                        delegations.push(delegation1);
                        delegations.push(delegation2);
                        //save data to delegator_rewards table
                        let amount1 = 0;
                        let amount2 = 0;
                        if (txData.tx_response.logs && txData.tx_response.logs.length > 0
                            && txData.tx_response.logs[i].events && txData.tx_response.logs[i].events.length > 0) {
                            const events = txData.tx_response.logs[i].events;
                            const claimEvent = events.find(i => i.type === 'transfer');
                            if (claimEvent) {
                                const attributes = claimEvent.attributes;
                                amount1 = Number(attributes[2].value.replace(CONST_CHAR.UAURA, ''));
                                if (attributes.length > 3) {
                                    amount2 = Number(attributes[5].value.replace(CONST_CHAR.UAURA, ''));
                                }
                            }
                        }
                        let reward1 = new DelegatorReward();
                        reward1.delegator_address = message.delegator_address;
                        reward1.validator_address = message.validator_src_address;
                        reward1.amount = amount1;
                        reward1.tx_hash = txData.tx_response.txhash;
                        delegatorRewards.push(reward1);
                        let reward2 = new DelegatorReward();
                        reward2.delegator_address = message.delegator_address;
                        reward2.validator_address = message.validator_dst_address;
                        reward2.amount = amount2;
                        reward2.tx_hash = txData.tx_response.txhash;
                        delegatorRewards.push(reward2);
                    } else if (txType === CONST_MSG_TYPE.MSG_WITHDRAW_DELEGATOR_REWARD) {
                        let reward = new DelegatorReward();
                        reward.delegator_address = message.delegator_address;
                        reward.validator_address = message.validator_address;
                        reward.amount = 0;
                        if (txData.tx_response.logs && txData.tx_response.logs.length > 0
                            && txData.tx_response.logs[i].events && txData.tx_response.logs[i].events.length > 0) {
                            const events = txData.tx_response.logs[i].events;
                            const rewardEvent = events.find(i => i.type === 'withdraw_rewards');
                            const attributes = rewardEvent.attributes;
                            const amount = attributes[0].value;
                            reward.amount = Number(amount.replace(CONST_CHAR.UAURA, ''));
                        }
                        reward.tx_hash = txData.tx_response.txhash;
                        reward.created_at = new Date(txData.tx_response.timestamp);
                        delegatorRewards.push(reward);
                    }
                }
            }
        }
        if (proposalVotes.length > 0) {
            await this.proposalVoteRepository.upsert(proposalVotes, []);
        }
        if (proposalDeposits.length > 0) {
            await this.proposalDepositRepository.upsert(proposalDeposits, []);
        }
        if (historyProposals.length > 0) {
            await this.historyProposalRepository.upsert(historyProposals, []);
        }
        if (delegations.length > 0) {

            // TODO: Write delegation to influxdb
            this.influxDbClient.writeDelegations(delegations);

            await this.delegationRepository.upsert(delegations, []);
        }
        if (delegatorRewards.length > 0) {
            await this.delegatorRewardRepository.upsert(delegatorRewards, []);
        }
    }

    async removeBlockError(height: number) {
        await this.blockSyncErrorRepository.remove({ height: height });
    }

    async insertBlockError(block_hash: string, height: number) {
        const blockSyncError = new BlockSyncError();
        blockSyncError.block_hash = block_hash;
        blockSyncError.height = height;
        await this.blockSyncErrorRepository.create(blockSyncError);
    }

    async updateStatus(newHeight) {
        const status = await this.statusRepository.findOne();
        status.current_block = newHeight;
        await this.statusRepository.create(status);
    }

    async getCurrentStatus() {
        const status = await this.statusRepository.findOne();
        if (!status[0]) {
            const newStatus = new SyncStatus();
            newStatus.current_block = Number(this.configService.get('START_HEIGHT'));
            await this.statusRepository.create(newStatus);
            this.currentBlock = Number(this.configService.get('START_HEIGHT'));
        } else {
            this.currentBlock = status[0].current_block;
        }
    }

    /**
   * getBlockLatest
   * @returns 
   */
    async getBlockLatest(): Promise<any> {
        this._logger.log(null, `Class ${SyncTaskService.name}, call getBlockLatest method`);

        const paramsBlockLatest = `blocks/latest`;
        const results = await this._commonUtil.getDataAPI(this.api, paramsBlockLatest);
        return results;
    }
}