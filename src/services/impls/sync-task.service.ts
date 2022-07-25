import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { bech32 } from 'bech32';
import { sha256 } from 'js-sha256';
import { InjectSchedule, Schedule } from 'nest-schedule';
import {
  CONST_CHAR,
  CONST_MSG_TYPE,
  CONST_PUBKEY_ADDR,
  NODE_API,
  SMART_CONTRACT_VERIFICATION
} from '../../common/constants/app.constant';
import { BlockSyncError, MissedBlock } from '../../entities';
import { SyncDataHelpers } from '../../helpers/sync-data.helpers';
import { REPOSITORY_INTERFACE } from '../../module.config';
import { IBlockSyncErrorRepository } from '../../repositories/iblock-sync-error.repository';
import { IBlockRepository } from '../../repositories/iblock.repository';
import { IDelegationRepository } from '../../repositories/idelegation.repository';
import { IDelegatorRewardRepository } from '../../repositories/idelegator-reward.repository';
import { IHistoryProposalRepository } from '../../repositories/ihistory-proposal.repository';
import { IMissedBlockRepository } from '../../repositories/imissed-block.repository';
import { IProposalDepositRepository } from '../../repositories/iproposal-deposit.repository';
import { IProposalVoteRepository } from '../../repositories/iproposal-vote.repository';
import { ISmartContractRepository } from '../../repositories/ismart-contract.repository';
import { ISyncStatusRepository } from '../../repositories/isync-status.repository';
import { ITransactionRepository } from '../../repositories/itransaction.repository';
import { IValidatorRepository } from '../../repositories/ivalidator.repository';
import { ENV_CONFIG } from '../../shared/services/config.service';
import { CommonUtil } from '../../utils/common.util';
import { InfluxDBClient } from '../../utils/influxdb-client';
import { ISyncTaskService } from '../isync-task.service';

@Injectable()
export class SyncTaskService implements ISyncTaskService {
  private readonly _logger = new Logger(SyncTaskService.name);
  private rpc;
  private api;
  private influxDbClient: InfluxDBClient;
  private isSyncValidator = false;
  private isSyncMissBlock = false;
  private threads = 0;
  private schedulesSync: Array<number> = [];
  private smartContractService;

  constructor(
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
    @InjectSchedule() private readonly schedule: Schedule,
  ) {
    this._logger.log(
      '============== Constructor Sync Task Service ==============',
    );

    this.rpc = ENV_CONFIG.NODE.RPC;
    this.api = ENV_CONFIG.NODE.API;

    this.influxDbClient = new InfluxDBClient(
      ENV_CONFIG.INFLUX_DB.BUCKET,
      ENV_CONFIG.INFLUX_DB.ORGANIZTION,
      ENV_CONFIG.INFLUX_DB.URL,
      ENV_CONFIG.INFLUX_DB.TOKEN,
    );

    this.smartContractService = ENV_CONFIG.SMART_CONTRACT_SERVICE;
    this.threads = ENV_CONFIG.THREADS;
  }

  /**
   * Get latest block to insert Block Sync Error table
   */
  @Interval(5000)
  async cronSync() {
    // Get the highest block and insert into SyncBlockError
    try {
      let currentHeight = 0;
      this._logger.log('start cron generate block sync error');
      const [blockLatest, currentBlock, blockStatus] =
        await Promise.all([
          this.getBlockLatest(),
          this.blockSyncErrorRepository.max('height'),
          this.statusRepository.findOne()
        ]);

      if (Number(currentBlock?.height) > Number(blockStatus.current_block)) {
        currentHeight = Number(currentBlock.height);
      } else {
        currentHeight = Number(blockStatus.current_block);
      }

      let latestBlk = Number(blockLatest?.block?.header?.height || 0);
      const blockErrors = [];

      if (latestBlk > currentHeight) {
        if (latestBlk - currentHeight > this.threads) {
          latestBlk = currentHeight + this.threads;
        }
        for (let i = currentHeight + 1; i < latestBlk; i++) {
          blockErrors.push({
            height: i
          })
        }
      }
      if (blockErrors.length > 0) {
        await this.blockSyncErrorRepository.upsert(blockErrors, [])
      }
    } catch (error) {
      this._logger.log('error when generate base blocks', error.stack);
      throw error;
    }

  }

  /**
   * Procces block insert data to db
  */
  @Interval(3000)
  async processBlock() {
    // Get the highest block and insert into SyncBlockError
    try {
      const results =
        await this.blockSyncErrorRepository.find({
          order: {
            height: 'asc'
          },
          take: this.threads
        });
      results.forEach(el => {
        try {
          this.schedule.scheduleTimeoutJob(
            el.height,
            100,
            async () => {
              try {
                await this.handleSyncData(el.height, true);
              } catch (error) {
                this._logger.log('Error when process blocks height', el.height);
                return true;
              }
              return true;
            },
            {
              maxRetry: -1
            }
          );
        } catch (error) {
          this._logger.log('Catch duplicate height ', error.stack);
        }

      })
    } catch (error) {
      this._logger.log('error when process blocks', error.stack);
      throw error;
    }

  }

  @Interval(3000)
  async syncValidator() {
    // check status
    if (this.isSyncValidator) {
      this._logger.log('Already syncing validator... wait');
      return;
    } else {
      this._logger.log('Fetching data validator...');
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
            const upTime =
              ((Number(signedBlocksWindow) - Number(missedBlocksCounter)) /
                Number(signedBlocksWindow)) *
              100;

            newValidator.up_time =
              String(upTime.toFixed(2)) + CONST_CHAR.PERCENT;
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
          this.influxDbClient.flushData();

          this.isSyncValidator = false;
        } catch (error) {
          this.isSyncValidator = false;
          this._logger.error(`${error.name}: ${error.message}`);
          this._logger.error(`${error.stack}`);
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
      this.validatorRepository.update(validatorData);
    }
  }

  @Interval(3000)
  async syncMissedBlock() {
    // check status
    if (this.isSyncMissBlock) {
      this._logger.log('Already syncing validator... wait', null);
      return;
    } else {
      this._logger.log('fetching data validator...', null);
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
                  await this.missedBlockRepository.upsert([newMissedBlock], ['height']);
                  // TODO: Write missed block to influxdb
                  this.influxDbClient.writeMissedBlock(
                    newMissedBlock.validator_address,
                    newMissedBlock.height,
                  );
                  this.influxDbClient.flushData();
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

  async handleSyncData(syncBlock: number, recallSync = false): Promise<any> {
    this._logger.log(
      null,
      `Class ${SyncTaskService.name}, call handleSyncData method with prameters: {syncBlock: ${syncBlock}}`,
    );

    try {
      // TODO: init write api
      this.influxDbClient.initWriteApi();

      // get validators
      const paramsValidator = NODE_API.VALIDATOR;
      const validatorData = await this._commonUtil.getDataAPI(
        this.api,
        paramsValidator,
      );

      // fetching block from node
      const paramsBlock = `block?height=${syncBlock}`;
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

      // Set proposer and operator_address from validators
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
        let txDatas = [];
        const txs = [];
        for (const key in blockData.block.data.txs) {
          const element = blockData.block.data.txs[key];
          const txHash = sha256(Buffer.from(element, 'base64')).toUpperCase();
          const paramsTx = `cosmos/tx/v1beta1/txs/${txHash}`;
          txs.push(this._commonUtil.getDataAPI(this.api, paramsTx));

        }

        txDatas = await Promise.all(txs);
        let i = 0;
        // create transaction
        for (const key in blockData.block.data.txs) {
          const element = blockData.block.data.txs[key];

          const txHash = sha256(Buffer.from(element, 'base64')).toUpperCase();
          const txData = txDatas[i];

          i += 1;
          const [txType, txRawLogData, txContractAddress] =
            SyncDataHelpers.makeTxRawLogData(txData);
          // Make up transaction data from block data
          const newTx = SyncDataHelpers.makeTrxData(
            txData,
            syncBlock,
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

          // Check to push into list transaction
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

      this.influxDbClient.flushData();

      /**
       * TODO: Flush pending writes and close writeApi.
       */
      // this.influxDbClient.closeWriteApi();

      await this.updateStatus(syncBlock);

      // Delete data on Block sync error table
      await this.removeBlockError(syncBlock);
      this._logger.debug(
        `============== Remove blockSyncError complete: ${syncBlock} ===============`,
      );

      const idxSync = this.schedulesSync.indexOf(syncBlock);
      if (idxSync > -1) {
        this.schedulesSync.splice(idxSync, 1);
      }
    } catch (error) {
      this._logger.error(
        null,
        `Sync Blocked & Transaction were error height: ${syncBlock}, ${error.name}: ${error.message}`,
      );
      this._logger.error(null, `${error.stack}`);

      const idxSync = this.schedulesSync.indexOf(syncBlock);
      if (idxSync > -1) {
        this.schedulesSync.splice(idxSync, 1);
      }
      throw new Error(error);
    }
  }

  /**
   * Sync data with transaction
   * @param listTransactions
   */
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
                execute_msg_schema,
                s3_location;
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
                s3_location,
              };
              if (smartContract.url)
                smartContracts.push(smartContract);
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

  /**
   * Remove data from block error sync table
   * @param height 
   */
  async removeBlockError(height: number) {
    await this.blockSyncErrorRepository.remove({ height: height });
  }

  /**
   * Add data to block error sync table
   * @param block_hash 
   * @param height 
   */
  async insertBlockError(block_hash: string, height: number) {
    const blockSyncError = new BlockSyncError();
    blockSyncError.block_hash = block_hash;
    blockSyncError.height = height;
    await this.blockSyncErrorRepository.create(blockSyncError);
  }

  /**
   * Upate current height of block
   * @param newHeight
   */
  async updateStatus(newHeight) {
    const status = await this.statusRepository.findOne();
    if (newHeight > status.current_block) {
      status.current_block = newHeight;
      await this.statusRepository.create(status);
    }
  }

  /**
   * Get block late from node
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
