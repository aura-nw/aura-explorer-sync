import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { InjectSchedule, Schedule } from 'nest-schedule';
import { INDEXER_API } from 'src/common/constants/app.constant';
import { TransactionHelper } from 'src/helpers/transaction.helper';
import { SyncTransactionRepository } from 'src/repositories/sync-transaction.repository';
import { ConfigService } from 'src/shared/services/config.service';
import * as util from 'util';
import { CommonUtil } from '../utils/common.util';

@Injectable()
export class SyncTransactionService {
  private readonly _logger = new Logger(SyncTransactionService.name);

  private indexerUrl;
  private indexerChainId;

  private isBlocked = false;
  private nextTransactionKey = '';

  constructor(
    private configService: ConfigService,
    private commonUtil: CommonUtil,
    private syncTxsRepository: SyncTransactionRepository,
    @InjectSchedule() private readonly schedule: Schedule,
  ) {
    this._logger.log(
      '============== Constructor Sync Transaction Service ==============',
    );

    this.indexerUrl = this.configService.get('INDEXER_URL');
    this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');
  }

  /**
   * crawl transaction from indexer
   */
  @Interval(3000)
  async crawlTransactions() {
    if (this.isBlocked) return;
    this.isBlocked = true;
    this._logger.log('Start crawl transactions ...');

    const lastTransaction = await this.syncTxsRepository.getLatestTransaction();
    const numOfSyncedTransactions = await this.handleCrawling(
      lastTransaction?.tx_hash,
      this.nextTransactionKey,
    );

    this.nextTransactionKey = '';
    this.isBlocked = false;
    this._logger.log(
      `End crawl transactions: ${numOfSyncedTransactions} transactions`,
    );
  }

  /**
   * Cleanup transactions after 7 days
   * Daily at 00:00
   */
  @Cron('0 0 * * *')
  async cleanupTransactions() {
    this._logger.log('Start cleanup transactions ...');

    const numOfTransactions = await this.syncTxsRepository.cleanUp(
      CLEAN_UP_DURATION_DAYS,
    );

    this._logger.log(
      `End cleanup transactions: ${numOfTransactions} transactions`,
    );
  }

  async handleCrawling(
    lastTxHash: string,
    nextTransactionKey: string = '',
    num: number = 0,
  ) {
    const expiredTime = new Date();
    expiredTime.setDate(expiredTime.getDate() - CLEAN_UP_DURATION_DAYS);

    // Fist time craw with 100 records/request, normal with 20 records/request
    const pageLimit = lastTxHash ? 20 : 100;

    let response;
    try {
      response = await this.commonUtil.getDataAPI(
        `${this.indexerUrl}${util.format(
          INDEXER_API.TRANSACTION,
          this.indexerChainId,
          pageLimit,
          nextTransactionKey,
        )}`,
        '',
      );
    } catch (e) {
      this._logger.log(`crawl transactions got error ${e.message}`);
    }

    if (!response?.data?.transactions) {
      return num;
      // // retry on failed
      // return await this.handleCrawling(lastTxHash, nextTransactionKey, depth);
    }

    const nextNum = num + pageLimit;
    const { transactions, nextKey } = response.data;

    // process data
    await this.handleSaveDatabase(transactions);

    // end process data

    const isLastRequest = transactions.some(
      (t) =>
        lastTxHash === t.tx_response.txhash ||
        new Date(t.tx_response.timestamp) < expiredTime,
    );
    if (isLastRequest) return num;

    return await this.handleCrawling(lastTxHash, nextKey, nextNum);
  }

  async handleSaveDatabase(transactions: any) {
    const transactionsToStore = transactions.map(
      TransactionHelper.makeSyncTransaction,
    );

    await this.syncTxsRepository.upsert(transactionsToStore, ['tx_hash']);
  }
}

// 8 days for sure with 7 days available for UTC-12 (current transaction in UTC 0)
const CLEAN_UP_DURATION_DAYS = 8;
