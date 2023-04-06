import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { InjectSchedule, Schedule } from 'nest-schedule';
import { INDEXER_API } from 'src/common/constants/app.constant';
import { TransactionHelper } from 'src/helpers/transaction.helper';
import { BlockRepository } from 'src/repositories/block.repository';
import { TransactionRepository } from 'src/repositories/transaction.repository';
import { ConfigService, ENV_CONFIG } from 'src/shared/services/config.service';
import * as util from 'util';
import { CommonUtil } from '../utils/common.util';
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import { In } from 'typeorm';

@Injectable()
export class SyncTransactionService {
  private readonly _logger = new Logger(SyncTransactionService.name);

  private indexerUrl;
  private indexerChainId;

  private isBlocked = false;

  constructor(
    private configService: ConfigService,
    private commonUtil: CommonUtil,
    private txsRepository: TransactionRepository,
    private blockRepository: BlockRepository,
    private smartContractRepository: SmartContractRepository,
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

    const lastTransaction = await this.txsRepository.getLatestTransaction();
    const lastBlockHeight = lastTransaction?.height || 0;
    const numOfSyncedTransactions = await this.handleCrawling(
      lastBlockHeight,
      PAGE_LIMIT,
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
  @Cron('0 0 * * *')
  async cleanupTransactions() {
    this._logger.log('Start cleanup transactions ...');

    const numOfTransactions = await this.txsRepository.cleanUp(
      CLEAN_UP_DURATION_DAYS,
    );

    this._logger.log(
      `End cleanup transactions: ${numOfTransactions} transactions`,
    );
  }

  async handleCrawling(fromHeight: number, pageLimit = 100) {
    let response;
    try {
      response = await this.commonUtil.getDataAPI(
        `${this.indexerUrl}${util.format(
          INDEXER_API.TRANSACTION,
          this.indexerChainId,
          pageLimit,
          fromHeight + 1,
        )}`,
        '',
      );
    } catch (e) {
      this._logger.log(`crawl transactions got error ${e.message}`);
    }

    if (!response?.data?.transactions) {
      return 0;
    }

    const { transactions } = response.data;

    // process data
    await this.handleSaveDatabase(transactions);

    // end process data

    return transactions.length;
  }

  async handleSaveDatabase(transactions: any) {
    const transactionsToStore = transactions.map(
      TransactionHelper.makeSyncTransaction,
    );

    // Filter contract address in list transaction
    const address = transactionsToStore
      .filter((item) => !!item.contract_address)
      .map((item) => item.contract_address);
    if (address?.length > 0) {
      const contracts = await this.smartContractRepository.find({
        where: { contract_address: In(address) },
      });
      if (contracts?.length > 0) {
        contracts?.forEach((item) => {
          // count num of total transaction
          const count = address.filter(
            (addr) => addr === item.contract_address,
          ).length;
          item.total_tx = item.total_tx + count;
        });
        // update num of total transaction to DB
        await this.smartContractRepository.update(contracts);
      }
    }

    await this.txsRepository.upsert(transactionsToStore, ['tx_hash']);
  }
}

const CLEAN_UP_DURATION_DAYS = ENV_CONFIG.SYNC_TRANSACTIONS_CLEAN_UP_DAY;
const PAGE_LIMIT = 100;
