import { Injectable, Logger } from '@nestjs/common';
import { CronExpression, Interval } from '@nestjs/schedule';
import { bech32 } from 'bech32';
import { sha256 } from 'js-sha256';
import { InjectSchedule, Schedule } from 'nest-schedule';
import {
  CONST_CHAR,
  CONST_MSG_TYPE,
  CONST_PUBKEY_ADDR,
  NODE_API,
} from '../common/constants/app.constant';
import { BlockSyncError, MissedBlock } from '../entities';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { BlockSyncErrorRepository } from '../repositories/block-sync-error.repository';
import { BlockRepository } from '../repositories/block.repository';
import { DelegationRepository } from '../repositories/delegation.repository';
import { DelegatorRewardRepository } from '../repositories/delegator-reward.repository';
import { MissedBlockRepository } from '../repositories/missed-block.repository';
import { ProposalVoteRepository } from '../repositories/proposal-vote.repository';
import { SyncStatusRepository } from '../repositories/sync-status.repository';
import { ValidatorRepository } from '../repositories/validator.repository';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { InfluxDBClient } from '../utils/influxdb-client';
import { InjectQueue } from '@nestjs/bull';
import { BackoffOptions, CronRepeatOptions, JobOptions, Queue } from 'bull';
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
  private everyRepeatOptions: CronRepeatOptions = {
    cron: CronExpression.EVERY_30_SECONDS,
  };

  constructor(
    private _commonUtil: CommonUtil,
    private validatorRepository: ValidatorRepository,
    private missedBlockRepository: MissedBlockRepository,
    private blockSyncErrorRepository: BlockSyncErrorRepository,
    private blockRepository: BlockRepository,
    private statusRepository: SyncStatusRepository,
    private proposalVoteRepository: ProposalVoteRepository,
    private delegationRepository: DelegationRepository,
    private delegatorRewardRepository: DelegatorRewardRepository,
    private smartContractCodeRepository: SmartContractCodeRepository,
    @InjectSchedule() private readonly schedule: Schedule,
    @InjectQueue('smart-contracts') private readonly contractQueue: Queue,
  ) {
    this._logger.log(
      '============== Constructor Sync Task Service ==============',
    );

    this.rpc = ENV_CONFIG.NODE.RPC;
    this.api = ENV_CONFIG.NODE.API;

    this.smartContractService = ENV_CONFIG.SMART_CONTRACT_SERVICE;
    this.threads = ENV_CONFIG.THREADS;

    this.connectInfluxDB();
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
      const [blockLatest, currentBlock, blockStatus] = await Promise.all([
        this.getBlockLatest(),
        this.blockSyncErrorRepository.max('height'),
        this.statusRepository.findOne(),
      ]);

      const height = Number(currentBlock?.height);
      const currentStatusBlock = Number(blockStatus?.current_block);

      this._logger.log(`Current block height: ${height}`);
      this._logger.log(`Current block status: ${currentStatusBlock}`);

      if (height > currentStatusBlock) {
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
          blockErrors.push(blockSyncError);
        }
      }
      if (blockErrors.length > 0) {
        this._logger.log(`Insert data to database`);
        await this.blockSyncErrorRepository.insertOnDuplicate(blockErrors, [
          'id',
        ]);
      }
    } catch (error) {
      const heights = blockErrors.map((m) => m.height);
      this._logger.log(
        `error when generate base blocks:${heights}`,
        error.stack,
      );
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
      const results = await this.blockSyncErrorRepository.find({
        order: {
          height: 'asc',
        },
        take: this.threads,
      });
      results.forEach((el) => {
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
              maxRetry: -1,
            },
          );
        } catch (error) {
          this._logger.log('Catch duplicate height ', error.stack);
        }
      });
    } catch (error) {
      this._logger.log('error when process blocks', error.stack);
      throw error;
    }
  }

  @Interval(5000)
  async syncValidator() {
    // check status
    if (this.isSyncValidator) {
      this._logger.log('Already syncing validator... wait');
      return;
    } else {
      this._logger.log('Fetching data validator...');
    }

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
          await this.validatorRepository.insertOnDuplicate(
            [newValidator],
            ['id'],
          );

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
                  await this.missedBlockRepository.upsert(
                    [newMissedBlock],
                    ['height'],
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
      blockData.block.header.time = this.influxDbClient.convertDate(
        blockData.block.header.time,
      );
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
        const listTransactions = [];
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
        for (const _key in blockData.block.data.txs) {
          const txData = txDatas[i];

          i += 1;
          const [txType] = SyncDataHelpers.makeTxRawLogData(txData);

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
        await this.blockRepository.upsert([newBlock], []);

        //sync data with transactions
        if (listTransactions.length > 0) {
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

      // Reconnect influxDb
      this.reconnectInfluxdb(error);

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
    const optionQueue: JobOptions = {
      removeOnComplete: true,
      // repeat: this.everyRepeatOptions,
      backoff: { type: 'fixed', delay: 3000 } as BackoffOptions,
    };
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
            const height = Number(txData.tx_response.height);
            const contractInstantiate = txData.tx_response.logs?.filter((f) =>
              f.events.find((x) => x.type == CONST_CHAR.INSTANTIATE),
            );
            const burnOrMintMessages = message.msg?.mint || message.msg?.burn;

            // Mint or Burn contract
            if (burnOrMintMessages) {
              const contractAddress = message.contract;

              this.contractQueue.add(
                'sync-execute-contracts',
                {
                  burnOrMintMessages,
                  contractAddress,
                },
                { ...optionQueue, timeout: 10000 },
              );
            }

            // Instantiate contract
            const instantiate = contractInstantiate?.length > 0 ? true : false;
            if (instantiate) {
              this.contractQueue.add(
                'sync-instantiate-contracts',
                {
                  height,
                },
                { ...optionQueue, delay: 7000 },
              );
            }
          } else if (txType == CONST_MSG_TYPE.MSG_INSTANTIATE_CONTRACT) {
            const height = Number(txData.tx_response.height);
            this.contractQueue.add(
              'sync-instantiate-contracts',
              {
                height,
              },
              { ...optionQueue, delay: 7000 },
            );
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
      await this.proposalVoteRepository.insertOnDuplicate(proposalVotes, [
        'id',
      ]);
    }
    if (delegations.length > 0) {
      await this.delegationRepository.insertOnDuplicate(delegations, ['id']);
    }
    if (delegatorRewards.length > 0) {
      await this.delegatorRewardRepository.insertOnDuplicate(delegatorRewards, [
        'id',
      ]);
    }
    if (smartContractCodes.length > 0) {
      await this.smartContractCodeRepository.insertOnDuplicate(
        smartContractCodes,
        ['id'],
      );
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
   * Reconnect Influxdb
   * @param error
   */
  reconnectInfluxdb(error: any) {
    const errorCode = error?.code || '';
    if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
      this.connectInfluxDB();
    }
  }

  /**
   * Create connecttion to InfluxDB
   */
  connectInfluxDB() {
    this.influxDbClient = new InfluxDBClient(
      ENV_CONFIG.INFLUX_DB.BUCKET,
      ENV_CONFIG.INFLUX_DB.ORGANIZTION,
      ENV_CONFIG.INFLUX_DB.URL,
      ENV_CONFIG.INFLUX_DB.TOKEN,
    );
  }
}
