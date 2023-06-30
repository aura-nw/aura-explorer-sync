import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { sha256 } from 'js-sha256';
import { InjectSchedule, Schedule } from 'nest-schedule';
import {
  CONST_MSG_TYPE,
  NODE_API,
  QUEUES,
} from '../common/constants/app.constant';
import { BlockSyncError } from '../entities';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { BlockSyncErrorRepository } from '../repositories/block-sync-error.repository';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { InjectQueue } from '@nestjs/bull';
import { BackoffOptions, JobOptions, Queue } from 'bull';
import { SyncStatusRepository } from 'src/repositories/sync-status.repository';
@Injectable()
export class SyncTaskService {
  private readonly _logger = new Logger(SyncTaskService.name);
  private rpc;
  private api;
  private threads = 0;
  private schedulesSync: Array<number> = [];

  isCompleteWrite = false;

  constructor(
    private _commonUtil: CommonUtil,
    private blockSyncErrorRepository: BlockSyncErrorRepository,
    private statusRepository: SyncStatusRepository,
    @InjectSchedule() private readonly schedule: Schedule,
    @InjectQueue('smart-contracts') private readonly contractQueue: Queue,
  ) {
    this._logger.log(
      '============== Constructor Sync Task Service ==============',
    );

    this.rpc = ENV_CONFIG.NODE.RPC;
    this.api = ENV_CONFIG.NODE.API;

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
          this.schedule.cancelJob(el?.height?.toString());
          this._logger.log('Catch duplicate height ', error.stack);
        }
      });
    } catch (error) {
      this._logger.log('error when process blocks', error.stack);
      throw error;
    }
  }

  async handleSyncData(syncBlock: number, recallSync = false): Promise<any> {
    this._logger.log(
      null,
      `Class ${SyncTaskService.name}, call handleSyncData method with prameters: {syncBlock: ${syncBlock}}`,
    );

    try {
      // fetching block from node
      const paramsBlock = `block?height=${syncBlock}`;
      const blockData = await this._commonUtil.getDataRPC(
        this.rpc,
        paramsBlock,
      );

      //Insert block error table
      if (!recallSync) {
        await this.insertBlockError(syncBlock);

        // Mark schedule is running
        this.schedulesSync.push(syncBlock);
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
        // create transaction
        const txLength = blockData.block.data.txs?.length || 0;
        for (let i = 0; i < txLength; i++) {
          const txData = txDatas[i];
          const [txType] = SyncDataHelpers.makeTxRawLogData(txData);

          // Check to push into list transaction
          const txTypeCheck = txType.substring(txType.lastIndexOf('.') + 1);
          if (
            txData.tx_response.code === 0 &&
            (<any>Object).values(CONST_MSG_TYPE).includes(txTypeCheck)
          ) {
            listTransactions.push(txData);
          }
        }

        //sync data with transactions
        if (listTransactions.length > 0) {
          await this.syncCW4973Status(listTransactions);
        }
      }

      // Update current block
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
  async syncCW4973Status(listTransactions) {
    const optionQueue: JobOptions = {
      removeOnComplete: true,
      attempts: 3,
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
          const txTypeReturn = message['@type'];
          const txType = txTypeReturn.substring(
            txTypeReturn.lastIndexOf('.') + 1,
          );
          if (txType === CONST_MSG_TYPE.MSG_EXECUTE_CONTRACT) {
            const contractAddress = message.contract;

            let takeMessage;
            let unequipMessage;
            const receiverAddress = message.sender;
            // Execute contract CW4973
            if (message.msg?.take?.signature) {
              takeMessage = message;
            }
            if (message.msg?.unequip?.token_id) {
              unequipMessage = message;
            }
            if (takeMessage || unequipMessage) {
              this.contractQueue.add(
                QUEUES.SYNC_CW4973_NFT_STATUS,
                {
                  takeMessage,
                  unequipMessage,
                  contractAddress,
                  receiverAddress,
                },
                { ...optionQueue },
              );
            }
          }
        }
      }
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
  async insertBlockError(height: number) {
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
    const paramsBlockLatest = NODE_API.LATEST_BLOCK;
    const results = await this._commonUtil.getDataAPI(
      this.api,
      paramsBlockLatest,
    );
    return results;
  }
}
