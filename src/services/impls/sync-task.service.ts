import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  CONST_CHAR,
  CONST_MSG_TYPE,
  CONST_PUBKEY_ADDR,
  NODE_API,
  SMART_CONTRACT_VERIFICATION,
} from '../../common/constants/app.constant';
import { BlockSyncError, MissedBlock, SyncStatus } from '../../entities';
import { ConfigService } from '../../shared/services/config.service';
import { CommonUtil } from '../../utils/common.util';
import { ISyncTaskService } from '../isync-task.service';
import { InjectSchedule, Schedule } from 'nest-schedule';
import { v4 as uuidv4 } from 'uuid';
import { bech32 } from 'bech32';
import { sha256 } from 'js-sha256';
import { REPOSITORY_INTERFACE } from '../../module.config';
import { IValidatorRepository } from '../../repositories/ivalidator.repository';
import { InfluxDBClient } from '../../utils/influxdb-client';
import { IMissedBlockRepository } from '../../repositories/imissed-block.repository';
import { IBlockSyncErrorRepository } from '../../repositories/iblock-sync-error.repository';
import { IBlockRepository } from '../../repositories/iblock.repository';
import { ITransactionRepository } from '../../repositories/itransaction.repository';
import { ISyncStatusRepository } from '../../repositories/isync-status.repository';
import { IProposalDepositRepository } from '../../repositories/iproposal-deposit.repository';
import { IProposalVoteRepository } from '../../repositories/iproposal-vote.repository';
import { IHistoryProposalRepository } from '../../repositories/ihistory-proposal.repository';
import { IDelegationRepository } from '../../repositories/idelegation.repository';
import { IDelegatorRewardRepository } from '../../repositories/idelegator-reward.repository';
import { ISmartContractRepository } from 'src/repositories/ismart-contract.repository';
import { ITokenContractRepository } from 'src/repositories/itoken-contract.repository';
import { SyncDataHelpers } from '../../helpers/sync-data.helpers';

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
    @InjectSchedule() private readonly schedule: Schedule,
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

    this.smartContractService = this.configService.get(
      'SMART_CONTRACT_SERVICE',
    );

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
    this._logger.log(
      null,
      `Class ${SyncTaskService.name}, call scheduleTimeoutJob method with prameters: {currentBlk: ${height}}`,
    );

    this.schedule.scheduleTimeoutJob(
      `schedule_sync_block_${uuidv4()}`,
      100,
      async () => {
        //Update code sync data
        await this.handleSyncData(height);

        // Close thread
        return true;
      },
    );
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
      const blockNotSync = latestBlk - currentBlk;
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
      this._logger.log(
        null,
        `Call threadProcess method error: $${error.message}`,
      );
    }

    // If current block not equal latest block when the symtem will call workerProcess method
    this.schedule.scheduleIntervalJob(
      `schedule_recall_${new Date().getTime()}`,
      1000,
      async () => {
        // Update code sync data
        this._logger.log(
          null,
          `Class ${SyncTaskService.name}, recall workerProcess method`,
        );
        this.workerProcess(height);

        // Close thread
        return true;
      },
    );
  }

  /**
   * workerProcess
   * @param height
   */
  async workerProcess(height: number = undefined) {
    this._logger.log(
      null,
      `Class ${SyncTaskService.name}, call workerProcess method`,
    );

    let currentBlk = 0,
      latestBlk = 0;
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
    } catch (err) {}

    this.threadProcess(currentBlk, latestBlk);
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

    const [validatorData, poolData, slashingData, signingData] =
      await Promise.all([
        this._commonUtil.getDataAPI(this.api, paramsValidator),
        this._commonUtil.getDataAPI(this.api, paramspool),
        this._commonUtil.getDataAPI(this.api, paramsSlashing),
        this._commonUtil.getDataAPI(this.api, paramsSigning),
      ]);

    if (validatorData) {
      this.isSyncValidator = true;
      for (const key in validatorData.validators) {
        const data = validatorData.validators[key];
        // get account address
        const operator_address = data.operator_address;
        const decodeAcc = bech32.decode(operator_address, 1023);
        const wordsByte = bech32.fromWords(decodeAcc.words);
        const account_address = bech32.encode(
          CONST_PUBKEY_ADDR.AURA,
          bech32.toWords(wordsByte),
        );
        // get validator detail
        const validatorUrl = `staking/validators/${data.operator_address}`;
        const validatorResponse = await this._commonUtil.getDataAPI(
          this.api,
          validatorUrl,
        );

        try {
          // create validator
          const status = Number(validatorResponse.result?.status) || 0;
          const validatorAddr = this._commonUtil.getAddressFromPubkey(
            data.consensus_pubkey.key,
          );

          // Makinf Validator entity to insert data
          const newValidator = SyncDataHelpers.makeValidatorData(
            data,
            account_address,
            status,
            validatorAddr,
          );

          const percentPower =
            (data.tokens / poolData.pool.bonded_tokens) * 100;
          newValidator.percent_power = percentPower.toFixed(2);
          const pubkey = this._commonUtil.getAddressFromPubkey(
            data.consensus_pubkey.key,
          );
          const address = this._commonUtil.hexToBech32(
            pubkey,
            CONST_PUBKEY_ADDR.AURAVALCONS,
          );
          const signingInfo = signingData.info.filter(
            (e) => e.address === address,
          );
          if (signingInfo.length > 0) {
            const signedBlocksWindow = slashingData.params.signed_blocks_window;
            const missedBlocksCounter = signingInfo[0].missed_blocks_counter;
            newValidator.up_time =
              ((signedBlocksWindow - missedBlocksCounter) /
                signedBlocksWindow) *
                100 +
              CONST_CHAR.PERCENT;
          }
          newValidator.self_bonded = 0;
          newValidator.percent_self_bonded = '0.00';
          try {
            // get delegations
            const paramDelegation = `cosmos/staking/v1beta1/validators/${data.operator_address}/delegations/${account_address}`;
            const delegationData = await this._commonUtil.getDataAPI(
              this.api,
              paramDelegation,
            );
            if (delegationData && delegationData.delegation_response) {
              newValidator.self_bonded =
                delegationData.delegation_response.balance.amount;
              const percentSelfBonded =
                (delegationData.delegation_response.balance.amount /
                  data.tokens) *
                100;
              newValidator.percent_self_bonded =
                percentSelfBonded.toFixed(2) + CONST_CHAR.PERCENT;
            }
          } catch (error) {
            this._logger.error(null, `Not exist delegations`);
          }
          const validatorFilter = await this.validatorRepository.findOne({
            where: { operator_address: data.operator_address },
          });
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
    const plainKeys = [
      'title',
      'jailed',
      'commission',
      'power',
      'percent_power',
      'self_bonded',
      'percent_self_bonded',
      'website',
      'details',
      'identity',
      'unbonding_height',
      'up_time',
      'status',
    ];
    const numberKeys = ['power', 'self_bonded'];
    Object.keys(validatorData).forEach((key) => {
      if (plainKeys.indexOf(key) !== -1) {
        if (numberKeys.indexOf(key) !== -1) {
          if (validatorData[key] !== Number(newValidator[key])) {
            validatorData[key] = newValidator[key];
            isSave = true;
          }
        } else {
          if (validatorData[key] !== newValidator[key]) {
            validatorData[key] = newValidator[key];
            isSave = true;
          }
        }
      }
    });
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
      const blockLatestData = await this._commonUtil.getDataAPI(
        this.api,
        paramsBlockLatest,
      );

      if (blockLatestData) {
        this.isSyncMissBlock = true;

        const heightLatest = blockLatestData.block.header.height;
        // get block by height
        const paramsBlock = `blocks/${heightLatest}`;
        // get validatorsets
        const paramsValidatorsets = `cosmos/base/tendermint/v1beta1/validatorsets/${heightLatest}`;

        const [blockData, validatorsetsData] = await Promise.all([
          this._commonUtil.getDataAPI(this.api, paramsBlock),
          this._commonUtil.getDataAPI(this.api, paramsValidatorsets),
        ]);

        if (validatorsetsData) {
          for (const key in validatorsetsData.validators) {
            const data = validatorsetsData.validators[key];
            const address = this._commonUtil.getAddressFromPubkey(
              data.pub_key.key,
            );

            if (blockData) {
              const signingInfo = blockData.block.last_commit.signatures.filter(
                (e) => e.validator_address === address,
              );
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

  @Interval(3000)
  async blockSyncError() {
    const result: BlockSyncError =
      await this.blockSyncErrorRepository.findOne();
    if (result) {
      this._logger.log(
        null,
        `Class ${SyncTaskService.name}, call blockSyncError method with prameters: {syncBlock: ${result.height}}`,
      );
      const idxSync = this.schedulesSync.indexOf(result.height);

      // Check height has sync or not. If height hasn't sync when we recall handleSyncData method
      if (idxSync < 0) {
        await this.handleSyncData(result.height, true);
        this.schedulesSync.splice(idxSync, 1);
      }
    }
  }

  async handleSyncData(syncBlock: number, recallSync = false): Promise<any> {
    this._logger.log(
      null,
      `Class ${SyncTaskService.name}, call handleSyncData method with prameters: {syncBlock: ${syncBlock}}`,
    );
    // this.logger.log(null, `Already syncing Block: ${syncBlock}`);

    // TODO: init write api
    this.influxDbClient.initWriteApi();

    // get validators
    const paramsValidator = NODE_API.VALIDATOR;
    const validatorData = await this._commonUtil.getDataAPI(
      this.api,
      paramsValidator,
    );
    const fetchingBlockHeight = syncBlock;

    try {
      // fetching block from node
      const paramsBlock = `block?height=${fetchingBlockHeight}`;
      const blockData = await this._commonUtil.getDataRPC(
        this.rpc,
        paramsBlock,
      );

      // make block object from block data
      const newBlock = SyncDataHelpers.makeBlockData(blockData);

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
      for (const key in validatorData.validators) {
        const ele = validatorData.validators[key];
        const pubkey = this._commonUtil.getAddressFromPubkey(
          ele.consensus_pubkey.key,
        );
        if (pubkey === operatorAddress) {
          newBlock.proposer = ele.description.moniker;
          newBlock.operator_address = ele.operator_address;
        }
      }

      if (blockData.block.data.txs && blockData.block.data.txs.length > 0) {
        const transactions = [];
        const listTransactions = [];
        const influxdbTrans = [];
        // create transaction
        for (const key in blockData.block.data.txs) {
          const element = blockData.block.data.txs[key];

          const txHash = sha256(Buffer.from(element, 'base64')).toUpperCase();
          this._logger.log(null, `processing tx: ${txHash}`);

          // fetch tx data
          const paramsTx = `cosmos/tx/v1beta1/txs/${txHash}`;

          const txData = await this._commonUtil.getDataAPI(this.api, paramsTx);

          const [txType, txRawLogData, txContractAddress] =
            SyncDataHelpers.makeTxRawLogData(txData);
          // Make up transaction data from block data
          const newTx = SyncDataHelpers.makeTrxData(
            txData,
            fetchingBlockHeight,
            txType,
            txRawLogData,
            blockData.block.header.time,
            txContractAddress,
          );

          transactions.push(newTx);

          // Push data to array, it's insert data to Influxd db
          influxdbTrans.push({
            tx_hash: newTx.tx_hash,
            height: newTx.height,
            type: newTx.type,
            timestamp: newTx.timestamp,
          });

          // check to push into list transaction
          const txTypeCheck = txType.substring(txType.lastIndexOf('.') + 1);
          if (
            txData.tx_response.code === 0 &&
            (<any>Object).values(CONST_MSG_TYPE).includes(txTypeCheck)
          ) {
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
          transactions.map((item) => (item.blockId = savedBlock[0].id));
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
        newBlock.proposer,
      );

      /**
       * TODO: Flush pending writes and close writeApi.
       */
      // this.influxDbClient.closeWriteApi();

      await this.updateStatus(fetchingBlockHeight);

      // Delete data on Block sync error table
      await this.removeBlockError(syncBlock);

      const idxSync = this.schedulesSync.indexOf(fetchingBlockHeight);
      if (idxSync > -1) {
        this.schedulesSync.splice(idxSync, 1);
      }
    } catch (error) {
      this._logger.error(
        null,
        `Sync Blocked & Transaction were error height: ${fetchingBlockHeight}, ${error.name}: ${error.message}`,
      );
      this._logger.error(null, `${error.stack}`);

      const idxSync = this.schedulesSync.indexOf(fetchingBlockHeight);
      if (idxSync > -1) {
        this.schedulesSync.splice(idxSync, 1);
      }
      throw new Error(error);
    }
  }

  async syncDataWithTransactions(listTransactions) {
    const proposalVotes = [];
    const proposalDeposits = [];
    const historyProposals = [];
    const delegations = [];
    const delegatorRewards = [];
    let smartContracts = [];
    for (let k = 0; k < listTransactions.length; k++) {
      const txData = listTransactions[k];
      if (
        txData.tx.body.messages &&
        txData.tx.body.messages.length > 0 &&
        txData.tx.body.messages.length === txData.tx_response.logs.length
      ) {
        for (let i = 0; i < txData.tx.body.messages.length; i++) {
          const message: any = txData.tx.body.messages[i];
          //check type to sync data
          const txTypeReturn = message['@type'];
          const txType = txTypeReturn.substring(
            txTypeReturn.lastIndexOf('.') + 1,
          );
          if (txType === CONST_MSG_TYPE.MSG_VOTE) {
            const proposalVote = SyncDataHelpers.makeVoteData(txData, message);
            proposalVotes.push(proposalVote);
          } else if (txType === CONST_MSG_TYPE.MSG_SUBMIT_PROPOSAL) {
            const [historyProposal, proposalDeposit] =
              SyncDataHelpers.makeSubmitProposalData(txData, message, i);
            historyProposals.push(historyProposal);
            if (proposalDeposit) proposalDeposits.push(proposalDeposit);
          } else if (txType === CONST_MSG_TYPE.MSG_DEPOSIT) {
            const proposalDeposit = SyncDataHelpers.makeDepositData(
              txData,
              message,
            );
            proposalDeposits.push(proposalDeposit);
          } else if (txType === CONST_MSG_TYPE.MSG_DELEGATE) {
            const [delegation, reward] = SyncDataHelpers.makeDelegateData(
              txData,
              message,
              i,
            );
            delegations.push(delegation);
            delegatorRewards.push(reward);
          } else if (txType === CONST_MSG_TYPE.MSG_UNDELEGATE) {
            const [delegation, reward] = SyncDataHelpers.makeUndelegateData(
              txData,
              message,
              i,
            );
            delegations.push(delegation);
            delegatorRewards.push(reward);
          } else if (txType === CONST_MSG_TYPE.MSG_REDELEGATE) {
            const [delegation1, delegation2, reward1, reward2] =
              SyncDataHelpers.makeRedelegationData(txData, message, i);
            delegations.push(delegation1);
            delegations.push(delegation2);
            delegatorRewards.push(reward1);
            delegatorRewards.push(reward2);
          } else if (txType === CONST_MSG_TYPE.MSG_WITHDRAW_DELEGATOR_REWARD) {
            const reward = SyncDataHelpers.makeWithDrawDelegationData(
              txData,
              message,
              i,
            );
            delegatorRewards.push(reward);
          } else if (txType === CONST_MSG_TYPE.MSG_EXECUTE_CONTRACT) {
            try {
              const _smartContracts = SyncDataHelpers.makeExecuteContractData(
                txData,
                message,
              );
              if (_smartContracts.length > 0) {
                smartContracts = smartContracts.concat(_smartContracts);
              }
              // await this.smartContractRepository.create(contracts);
            } catch (error) {
              this._logger.error(
                null,
                `Got error in create minter transaction`,
              );
              this._logger.error(null, `${error.stack}`);
            }
          } else if (txType == CONST_MSG_TYPE.MSG_INSTANTIATE_CONTRACT) {
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

              const paramGetHash = `/api/v1/smart-contract/get-hash/${code_id}`;
              let smartContractResponse;
              try {
                smartContractResponse = await this._commonUtil.getDataAPI(
                  this.smartContractService,
                  paramGetHash,
                );
              } catch (error) {
                this._logger.error(
                  'Can not connect to smart contract verify service or LCD service',
                  error,
                );
              }

              let contract_hash = '',
                contract_verification = SMART_CONTRACT_VERIFICATION.UNVERIFIED,
                contract_match,
                url,
                compiler_version,
                instantiate_msg_schema,
                query_msg_schema,
                execute_msg_schema;
              if (smartContractResponse) {
                contract_hash =
                  smartContractResponse.Message.length === 64
                    ? smartContractResponse.Message
                    : '';
              }
              if (contract_hash !== '') {
                const existContractHash =
                  await this.smartContractRepository.findContractByHash(
                    contract_hash,
                  );
                if (
                  existContractHash.filter(
                    (e) =>
                      e.contract_verification ==
                      SMART_CONTRACT_VERIFICATION.EXACT_MATCH,
                  ).length > 0
                ) {
                  contract_verification =
                    SMART_CONTRACT_VERIFICATION.SIMILAR_MATCH;
                  const exactContract = existContractHash.find(
                    (x) =>
                      x.contract_verification ==
                      SMART_CONTRACT_VERIFICATION.EXACT_MATCH,
                  );
                  contract_match = exactContract.contract_address;
                  url = exactContract.url;
                  compiler_version = exactContract.compiler_version;
                  instantiate_msg_schema = exactContract.instantiate_msg_schema;
                  query_msg_schema = exactContract.query_msg_schema;
                  execute_msg_schema = exactContract.execute_msg_schema;
                }
              }

              const smartContract = {
                height,
                code_id,
                contract_name,
                contract_address,
                creator_address,
                contract_hash,
                tx_hash,
                url,
                instantiate_msg_schema,
                query_msg_schema,
                execute_msg_schema,
                contract_match,
                contract_verification,
                compiler_version,
              };
              smartContracts.push(smartContract);
              // await this.smartContractRepository.create(smartContract);
            } catch (error) {
              this._logger.error(
                null,
                `Got error in instantiate contract transaction`,
              );
              this._logger.error(null, `${error.stack}`);
            }
          } else if (txType === CONST_MSG_TYPE.MSG_CREATE_VALIDATOR) {
            const delegation = SyncDataHelpers.makeCreateValidatorData(
              txData,
              message,
            );
            delegations.push(delegation);
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
    if (smartContracts.length > 0) {
      smartContracts.map(async (smartContract) => {
        if (smartContract.contract_name == '') {
          const param = `/cosmwasm/wasm/v1/contract/${smartContract.contract_address}`;
          const contractData = await this._commonUtil.getDataAPI(
            this.api,
            param,
          );
          smartContract.contract_name = contractData.contract_info.label;
        }
      });
      await this.smartContractRepository.upsert(smartContracts, []);
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
    if (newHeight > status.current_block) {
      status.current_block = newHeight;
      await this.statusRepository.create(status);
    }
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
    this._logger.log(
      null,
      `Class ${SyncTaskService.name}, call getBlockLatest method`,
    );
    const paramsBlockLatest = `blocks/latest`;
    const results = await this._commonUtil.getDataAPI(
      this.api,
      paramsBlockLatest,
    );
    return results;
  }
}
