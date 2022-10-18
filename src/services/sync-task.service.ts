import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { bech32 } from 'bech32';
import { sha256 } from 'js-sha256';
import { InjectSchedule, Schedule } from 'nest-schedule';
import { DeploymentRequestsRepository } from '../repositories/deployment-requests.repository';
import {
  CONST_CHAR,
  CONST_MSG_TYPE,
  CONST_PUBKEY_ADDR,
  CONTRACT_TRANSACTION_EXECUTE_TYPE,
  NODE_API,
  SMART_CONTRACT_VERIFICATION
} from '../common/constants/app.constant';
import { BlockSyncError, MissedBlock, SmartContract } from '../entities';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { BlockSyncErrorRepository } from '../repositories/block-sync-error.repository';
import { BlockRepository } from '../repositories/block.repository';
import { DelegationRepository } from '../repositories/delegation.repository';
import { DelegatorRewardRepository } from '../repositories/delegator-reward.repository';
import { MissedBlockRepository } from '../repositories/missed-block.repository';
import { ProposalVoteRepository } from '../repositories/proposal-vote.repository';
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import { SyncStatusRepository } from '../repositories/sync-status.repository';
import { TransactionRepository } from '../repositories/transaction.repository';
import { ValidatorRepository } from '../repositories/validator.repository';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { InfluxDBClient } from '../utils/influxdb-client';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { SmartContractCodeRepository } from '../repositories/smart-contract-code.repository';
@Injectable()
export class SyncTaskService {
  private readonly _logger = new Logger(SyncTaskService.name);
  private rpc;
  private api;
  private influxDbClient: InfluxDBClient;
  private isSyncValidator = false;
  private isSyncMissBlock = false;
  private threads = 0;
  private schedulesSync: Array<number> = [];
  private smartContractService;

  isCompleteWrite = false;
  maxHeight = ENV_CONFIG.BLOCK_START;
  private nodeEnv = ENV_CONFIG.NODE_ENV;

  constructor(
    private _commonUtil: CommonUtil,
    private validatorRepository: ValidatorRepository,
    private missedBlockRepository: MissedBlockRepository,
    private blockSyncErrorRepository: BlockSyncErrorRepository,
    private blockRepository: BlockRepository,
    private txRepository: TransactionRepository,
    private statusRepository: SyncStatusRepository,
    private proposalVoteRepository: ProposalVoteRepository,
    private delegationRepository: DelegationRepository,
    private delegatorRewardRepository: DelegatorRewardRepository,
    private smartContractRepository: SmartContractRepository,
    private deploymentRequestsRepository: DeploymentRequestsRepository,
    private smartContractCodeRepository: SmartContractCodeRepository,
    @InjectSchedule() private readonly schedule: Schedule,
    @InjectQueue('smart-contracts') private readonly contractQueue: Queue
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
  @Interval(ENV_CONFIG.TIMES_SYNC)
  async cronSync() {
    // Get the highest block and insert into SyncBlockError
    const blockErrors = [];
    try {
      let currentHeight = 0;
      this._logger.log('start cron generate block sync error');
      const [blockLatest, currentBlock, blockStatus] =
        await Promise.all([
          this.getBlockLatest(),
          this.blockSyncErrorRepository.max('height'),
          this.statusRepository.findOne()
        ]);

      if (Number(currentBlock?.height) > Number(blockStatus?.current_block)) {
        currentHeight = Number(currentBlock.height);
      } else {
        currentHeight = Number(blockStatus.current_block) || 0;
      }

      let latestBlk = Number(blockLatest?.block?.header?.height || 0);

      if (latestBlk > currentHeight) {
        if (latestBlk - currentHeight > this.threads) {
          latestBlk = currentHeight + this.threads;
        }
        for (let i = currentHeight + 1; i < latestBlk; i++) {
          const blockSyncError = new BlockSyncError();
          blockSyncError.height = i;
          blockSyncError.block_hash = '';
          blockErrors.push(blockSyncError)
        }
      }
      if (blockErrors.length > 0) {
        this._logger.log(`blockErrors:${blockErrors}`);
        await this.blockSyncErrorRepository.insertOnDuplicate(blockErrors, ['id'])
      }
    } catch (error) {
      this._logger.log(`error when generate base blocks:${blockErrors}`, error.stack);
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
            el.height.toString(),
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
          await this.validatorRepository.insertOnDuplicate([newValidator], ['id']);

          // TODO: Write validator to influxdb
          this.influxDbClient.writeValidator(
            newValidator.operator_address,
            newValidator.title,
            newValidator.jailed,
            newValidator.power,
          );
          await this.influxDbClient.flushData();

          this.isSyncValidator = false;
        } catch (error) {
          this.isSyncValidator = false;
          this._logger.error(`${error.name}: ${error.message}`);
          this._logger.error(`${error.stack}`);
        }
      }
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
      blockData.block.header.time = this.influxDbClient.convertDate(blockData.block.header.time);
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
          await this.txRepository.insertOnDuplicate(transactions, ['id']);
        }

        //sync data with transactions
        if (listTransactions.length > 0) {
          // // TODO: Write tx to influxdb
          // this.influxDbClient.writeTxs([...influxdbTrans]);

          await this.syncDataWithTransactions(listTransactions);
        }
      } else {
        //Insert or update Block
        await this.blockRepository.insertOnDuplicate([newBlock], ['id']);
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

      await this.influxDbClient.flushData();

      /**
       * TODO: Flush pending writes and close writeApi.
       */
      // this.influxDbClient.closeWriteApi();

      await this.updateStatus(syncBlock);

      // Delete data on Block sync error table
      await this.removeBlockError(syncBlock);
      this._logger.log(
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
    const delegations = [];
    const delegatorRewards = [];
    const smartContractCodes = [];
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
            if (reward.amount) {
              delegatorRewards.push(reward);
            }
          } else if (txType === CONST_MSG_TYPE.MSG_EXECUTE_CONTRACT) {
            this.contractQueue.add('sync-execute-contracts', {
              txData,
              message,
            });
          } else if (txType == CONST_MSG_TYPE.MSG_INSTANTIATE_CONTRACT) {
            this.contractQueue.add('sync-instantiate-contracts', {
              txData,
            });
          } else if (txType === CONST_MSG_TYPE.MSG_CREATE_VALIDATOR) {
            const delegation = SyncDataHelpers.makeCreateValidatorData(
              txData,
              message,
            );
            delegations.push(delegation);
          } else if (txType === CONST_MSG_TYPE.MSG_STORE_CODE) {
            const smartContractCode = SyncDataHelpers.makeStoreCodeData(
              txData,
              message,
            );
            smartContractCodes.push(smartContractCode);
          }
        }
      }
    }
    if (proposalVotes.length > 0) {
      await this.proposalVoteRepository.insertOnDuplicate(proposalVotes, ['id']);
    }
    if (delegations.length > 0) {
      // TODO: Write delegation to influxdb
      this.influxDbClient.writeDelegations(delegations);

      await this.delegationRepository.insertOnDuplicate(delegations, ['id']);
    }
    if (delegatorRewards.length > 0) {
      await this.delegatorRewardRepository.insertOnDuplicate(delegatorRewards, ['id']);
    }
    if (smartContractCodes.length > 0) {
      await this.smartContractCodeRepository.insertOnDuplicate(smartContractCodes, ['id']);
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

  /**
   * Write block were to influxdb
   * @returns 
   */
  // @Interval(2000)
  async BlockMissToInfluxdb() {
    const numRow = 500;
    if (ENV_CONFIG.SYNC_DATA_INFLUXD) {
      try {
        if (this.isCompleteWrite) {
          this._logger.debug(`BlockMissToInfluxdb is running...!`);
          return;
        } else {
          this._logger.debug(`BlockMissToInfluxdb is start write...!`);
        }
        this.influxDbClient.initQueryApi();

        this._logger.debug(` Start idx: ${this.maxHeight + 1} --- end idx: ${this.maxHeight + numRow}`);
        const blocks = await this.blockRepository.getBlockByRange((this.maxHeight + 1), (this.maxHeight + numRow));

        this._logger.debug(` Push data to array to write Influxdb`);
        const length = blocks?.length;
        if (blocks && length > 0) {
          this.isCompleteWrite = true;
          // TODO: init write api
          this.influxDbClient.initWriteApi();
          const points: Array<any> = [];
          for (let idx = 0; idx < length; idx++) {
            const block = blocks[idx];
            points.push({
              chainid: block.chainid,
              block_hash: block.block_hash,
              height: block.height,
              num_txs: block.num_txs,
              timestamp: block.timestamp,
              proposer: block.proposer
            });
          }
          this._logger.debug(` Push data complete`);
          if (points.length > 0) {
            this.influxDbClient.writeBlocks(points);
            this._logger.debug(`BlockMissToInfluxdb is start write successfully`);
          }

          // If the result is of length numRow or not? If equals set maxHeight = this.maxHeight + numRow else set maxHeight = this.maxHeight + length
          if (length === numRow) {
            this.maxHeight = this.maxHeight + numRow;
          } else {
            this.maxHeight = this.maxHeight + length;
          }

          this.isCompleteWrite = false;
        }
      } catch (err) {
        this.isCompleteWrite = false;
        this._logger.error(`BlockMissToInfluxdb call error: ${err.stack}`);
        throw err;
      }
    }
  }
}
