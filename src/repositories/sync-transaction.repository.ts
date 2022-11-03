import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Raw, Repository } from 'typeorm';
import { SyncTransaction } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class SyncTransactionRepository extends BaseRepository<SyncTransaction> {
  private readonly _logger = new Logger(SyncTransactionRepository.name);
  constructor(
    @InjectRepository(SyncTransaction)
    private readonly repos: Repository<SyncTransaction>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor SyncTransaction Repository ==============',
    );
  }

  async getLatestTransaction() {
    const transaction = await this.repos.find({
      take: 1,
      order: {
        timestamp: 'DESC',
      },
    });

    return transaction?.[0];
  }

  async cleanUp(numOfDay: number) {
    const result = await this.repos
      .createQueryBuilder()
      .delete()
      .where('`timestamp` < (NOW() - INTERVAL  :numOfDay DAY)', { numOfDay })
      .execute();

    return result.affected;
  }
}
