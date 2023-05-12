import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Queue } from 'bull';
import { CommonUtil } from '../utils/common.util';
import { TransactionRepository } from '../repositories/transaction.repository';
import { INDEXER_V2_API, QUEUES } from '../common/constants/app.constant';
import { TransactionHelper } from '../helpers/transaction.helper';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CronExpression } from '@nestjs/schedule';
import * as util from 'util';

@Processor('transaction')
export class TransactionProcessor {
  private readonly _logger = new Logger(TransactionProcessor.name);
  private isBlocked = false;

  constructor(
    private commonUtil: CommonUtil,
    private txsRepository: TransactionRepository,
    @InjectQueue('transaction') private readonly transactionQueue: Queue,
  ) {
    this._logger.log(
      '============== Constructor Sync Transaction Service ==============',
    );

    this.transactionQueue.add(
      QUEUES.SYNC_TRANSACTION,
      {},
      {
        removeOnFail: false,
        repeat: { cron: CronExpression.EVERY_5_SECONDS },
      },
    );

    this.transactionQueue.add(
      QUEUES.CLEAN_TRANSACTION,
      {},
      {
        removeOnFail: false,
        repeat: { cron: CronExpression.EVERY_DAY_AT_MIDNIGHT },
      },
    );
  }

  /**
   * crawl transaction from indexer
   */
  @Process(QUEUES.SYNC_TRANSACTION)
  async syncTransactions() {
    if (this.isBlocked) return;
    this.isBlocked = true;
    this._logger.log('Start crawl transactions ...');

    const lastTransaction = await this.txsRepository.getLatestTransaction();
    const lastBlockHeight = lastTransaction?.height || 0;
    const numOfSyncedTransactions = await this.handleCrawling(
      lastBlockHeight,
      100,
    );

    this.isBlocked = false;
    this._logger.log(
      `End crawl transactions: ${numOfSyncedTransactions} transactions`,
    );
  }

  /**
   * Cleanup transactions after 7 days
   * Daily at 00:00
   */
  @Process(QUEUES.CLEAN_TRANSACTION)
  async cleanupTransactions() {
    this._logger.log('Start cleanup transactions ...');

    const numOfTransactions = await this.txsRepository.cleanUp(
      ENV_CONFIG.SYNC_TRANSACTIONS_CLEAN_UP_DAY,
    );

    this._logger.log(
      `End cleanup transactions: ${numOfTransactions} transactions`,
    );
  }

  async handleCrawling(fromHeight: number, pageLimit = 100) {
    let transactions;
    try {
      //get list transaction
      const validatorAttributes = `height
      id
      transaction_messages {
        content
        type
      }
      events {
        type
        id
        event_attributes {
          value
          key
          id
          index
        }
      }
      fee
      timestamp
      hash`;

      const graphqlQuery = {
        query: util.format(
          INDEXER_V2_API.GRAPH_QL.LIST_TRANSACTION,
          validatorAttributes,
        ),
        variables: {
          limit: pageLimit,
          fromHeight: fromHeight,
        },
      };
      transactions = (
        await this.commonUtil.fetchDataFromGraphQL(
          ENV_CONFIG.INDEXER_V2.GRAPH_QL,
          'POST',
          graphqlQuery,
        )
      ).data[ENV_CONFIG.INDEXER_V2.CHAIN_DB]['transaction'];
    } catch (e) {
      this._logger.log(`crawl transactions got error ${e.message}`);
    }

    if (!transactions) {
      return 0;
    }

    // process data
    await this.handleSaveDatabase(transactions);

    // end process data

    return transactions.length;
  }

  async handleSaveDatabase(transactions: any) {
    const transactionsToStore = transactions.map(
      TransactionHelper.makeSyncTransaction,
    );

    await this.txsRepository.upsert(transactionsToStore, ['tx_hash']);
  }
}
