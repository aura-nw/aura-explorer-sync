import {
  InjectQueue,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueError,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { BackoffOptions, Job, JobOptions, Queue } from 'bull';
import * as util from 'util';
import {
  CONST_MSG_TYPE,
  INDEXER_V2_API,
  NODE_API,
  QUEUES,
} from 'src/common/constants/app.constant';
import { BlockSyncError } from 'src/entities';
import { SyncDataHelpers } from 'src/helpers/sync-data.helpers';
import { TransactionHelper } from 'src/helpers/transaction.helper';
import { BlockSyncErrorRepository } from 'src/repositories/block-sync-error.repository';
import { SmartContractRepository } from 'src/repositories/smart-contract.repository';
import { SyncStatusRepository } from 'src/repositories/sync-status.repository';
import { ENV_CONFIG } from 'src/shared/services/config.service';
import { CommonUtil } from 'src/utils/common.util';
import { InfluxDBClient } from 'src/utils/influxdb-client';
import { In } from 'typeorm';
import { ProposalVoteRepository } from 'src/repositories/proposal-vote.repository';
import { Logger } from '@nestjs/common';

@Processor(QUEUES.SYNC_BLOCK.QUEUE_NAME)
export class BlockProcessor {
  private readonly logger = new Logger(BlockProcessor.name);
  private threads = 0;
  private influxDbClient: InfluxDBClient;
  private api = ENV_CONFIG.NODE.API;

  constructor(
    private commonUtil: CommonUtil,
    private blockSyncErrorRepository: BlockSyncErrorRepository,
    private statusRepository: SyncStatusRepository,
    private smartContractRepository: SmartContractRepository,
    private proposalVoteRepository: ProposalVoteRepository,

    @InjectQueue(QUEUES.SYNC_BLOCK.QUEUE_NAME)
    private readonly blockQueue: Queue,
    @InjectQueue(QUEUES.SYNC_CONTRACT.QUEUE_NAME)
    private readonly contractQueue: Queue,
  ) {
    this.logger.log(
      '============== Constructor Block Processor ==============',
    );

    this.threads = 100;

    this.blockQueue.add(
      QUEUES.SYNC_BLOCK.JOBS.SYNC_BLOCK_HEIGHT,
      {},
      { removeOnFail: false, repeat: { every: Number(ENV_CONFIG.TIMES_SYNC) } },
    );

    this.blockQueue.add(
      QUEUES.SYNC_BLOCK.JOBS.PROCESS_BLOCK,
      {},
      { removeOnFail: false, repeat: { every: 3000 } },
    );

    this.connectInfluxDB();
  }

  @Process(QUEUES.SYNC_BLOCK.JOBS.SYNC_BLOCK_HEIGHT)
  async syncBlockHeight() {
    // Get the highest block and insert into SyncBlockError
    const blockErrors = [];
    try {
      let currentHeight = 0;
      this.logger.log('start cron generate block sync error');
      const [blockLatest, currentBlock, blockStatus] = await Promise.all([
        this.getBlockLatest(),
        this.blockSyncErrorRepository.max('height'),
        this.statusRepository.findOne(),
      ]);

      const height = Number(currentBlock?.height);
      const currentStatusBlock = Number(blockStatus?.current_block);

      this.logger.log(`Current block height: ${height}`);
      this.logger.log(`Current block status: ${currentStatusBlock}`);

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
        this.logger.log(`Insert data to database`);
        await this.blockSyncErrorRepository.insertOnDuplicate(blockErrors, [
          'id',
        ]);
      }
    } catch (error) {
      const heights = blockErrors.map((m) => m.height);
      this.logger.log(
        `error when generate base blocks:${heights}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process(QUEUES.SYNC_BLOCK.JOBS.PROCESS_BLOCK)
  async processBlock() {
    try {
      const blocksToProcess = (
        await this.blockSyncErrorRepository.find({
          order: { height: 'asc' },
          take: this.threads,
          select: ['height'],
        })
      ).map((block) => block.height);
      await this.handleSyncData(blocksToProcess);
    } catch (err) {
      throw err;
    }
  }

  async handleSyncData(syncBlocks: number[]): Promise<any> {
    this.logger.log(`handleSyncData called with: {syncBlock: ${syncBlocks}}`);

    try {
      this.influxDbClient.initWriteApi();
      const blockAttrs = `height
                          time
                          hash
                          data
                          transactions {
                            data
                          }`;
      const blocksQuery = {
        query: util.format(INDEXER_V2_API.GRAPH_QL.BLOCK, blockAttrs),
        variables: {
          whereClause: { height: { _in: syncBlocks } },
        },
      };
      const blocksData = (
        await this.commonUtil.fetchDataFromGraphQL(blocksQuery)
      ).data[ENV_CONFIG.INDEXER_V2.CHAIN_DB]['block'];

      for await (const blockData of blocksData) {
        const listTxToProcess = [];
        blockData.time = this.influxDbClient.convertDate(blockData.time);
        const newBlock = SyncDataHelpers.makeBlockData(blockData);

        if (blockData.transactions?.length > 0) {
          const txInBlock = blockData.transactions.filter((tx) => {
            const txType = tx.data.tx.body.messages[0]['@type'];
            const txTypeCheck = txType.split('.').at(-1);
            return Object.values(CONST_MSG_TYPE).includes(txTypeCheck);
          });
          listTxToProcess.push(...txInBlock);
        }

        //sync data with txs
        if (listTxToProcess.length > 0) {
          await this.syncDataWithTransactions(listTxToProcess);
        }

        const addressesInTx =
          TransactionHelper.getContractAddressInTX(listTxToProcess);

        if (addressesInTx.length > 0) {
          this.logger.log(
            `============== count total transaction addressInTx: ${addressesInTx} ===============`,
          );
          const contracts = await this.smartContractRepository.find({
            where: { contract_address: In(addressesInTx) },
          });
          if (contracts?.length > 0) {
            const result = [];
            contracts.forEach((contract) => {
              const count = addressesInTx.filter(
                (addr) => addr === contract.contract_address,
              ).length;
              result.push({
                id: contract.id,
                contract_address: contract.contract_address,
                total_tx: contract.total_tx + count,
              });
            });
            // update num of total transaction to DB
            await this.smartContractRepository.update(result);
            this.logger.log(
              `==== Update total Tx with data: ${JSON.stringify(result)} ===`,
            );
          }
        }

        // Write block to influxDB
        this.influxDbClient.writeBlock(
          newBlock.height,
          newBlock.block_hash,
          newBlock.num_txs,
          newBlock.chainid,
          newBlock.timestamp,
          newBlock.proposer,
        );
        await this.influxDbClient.flushData();

        await this.updateStatus(blockData.height);
        // Delete data on Block sync error table
        await this.removeBlockError(blockData.height);
        this.logger.log(
          `============== Remove blockSyncError complete: ${blockData.height} ===============`,
        );
      }
    } catch (error) {
      this.reconnectInfluxdb(error);

      throw error;
    }
  }

  async syncDataWithTransactions(listTransactions) {
    const proposalVotes = [];

    const optionQueue: JobOptions = {
      removeOnComplete: true,
      attempts: 3,
      // repeat: this.everyRepeatOptions,
      backoff: { type: 'fixed', delay: 3000 } as BackoffOptions,
    };
    for (let k = 0; k < listTransactions.length; k++) {
      const txData = listTransactions[k];
      if (
        txData.data.tx.body.messages &&
        txData.data.tx.body.messages.length > 0 &&
        txData.data.tx.body.messages.length ===
          txData.data.tx_response.logs?.length
      ) {
        for (let i = 0; i < txData.data.tx.body.messages.length; i++) {
          const message: any = txData.data.tx.body.messages[i];
          //check type to sync data
          const txTypeReturn = message['@type'];
          const txType = txTypeReturn.substring(
            txTypeReturn.lastIndexOf('.') + 1,
          );
          if (txType === CONST_MSG_TYPE.MSG_VOTE) {
            this.logger.error('Make vote data');
            const proposalVote = SyncDataHelpers.makeVoteData(
              txData.data,
              message,
            );
            proposalVotes.push(proposalVote);
            this.logger.error(JSON.stringify(message));
          } else if (txType === CONST_MSG_TYPE.MSG_EXECUTE_CONTRACT) {
            const lstContract: any = [];
            const logs = txData.data.tx_response.logs;
            logs?.forEach((log) => {
              log.events?.forEach((evt) => {
                evt.attributes?.forEach((att) => {
                  if (att.key === '_contract_address') {
                    lstContract.push(att.value);
                  }
                });
              });
            });
            const contractArr = [...new Set(lstContract)];
            const contractAddress = message.contract;
            this.contractQueue.add(
              QUEUES.SYNC_CONTRACT.JOBS.SYNC_EXECUTE_CONTRACTS,
              {
                message,
                contractAddress,
                contractArr,
              },
              { ...optionQueue, timeout: 10000 },
            );

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
                QUEUES.SYNC_CONTRACT.JOBS.SYNC_CW4973_NFT_STATUS,
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
    if (proposalVotes.length > 0) {
      this.logger.error(JSON.stringify(proposalVotes));
      await this.proposalVoteRepository.insertOnDuplicate(proposalVotes, [
        'id',
      ]);
    }
  }

  async removeBlockError(height: number) {
    await this.blockSyncErrorRepository.remove({ height: height });
  }

  async insertBlockError(height: number) {
    const blockSyncError = new BlockSyncError();
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

  async getBlockLatest(): Promise<any> {
    const paramsBlockLatest = NODE_API.LATEST_BLOCK;
    const results = await this.commonUtil.getDataAPI(
      this.api,
      paramsBlockLatest,
    );
    return results;
  }

  reconnectInfluxdb(error: any) {
    const errorCode = error?.code || '';
    if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
      this.connectInfluxDB();
    }
  }

  connectInfluxDB() {
    this.influxDbClient = new InfluxDBClient(
      ENV_CONFIG.INFLUX_DB.BUCKET,
      ENV_CONFIG.INFLUX_DB.ORGANIZTION,
      ENV_CONFIG.INFLUX_DB.URL,
      ENV_CONFIG.INFLUX_DB.TOKEN,
    );
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id} of type ${job.name}...`);
  }

  @OnQueueCompleted()
  async onComplete(job: Job) {
    this.logger.log(`Completed job ${job.id} of type ${job.name}`);
  }

  @OnQueueError()
  onError(job: Job, error: Error) {
    this.logger.error(`Error job ${job.id} of type ${job.name}`);
    this.logger.error(error.stack);
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}`);
    this.logger.error(error.stack);
  }
}
