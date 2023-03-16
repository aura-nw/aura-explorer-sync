import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class TransactionRepository extends BaseRepository<Transaction> {
  private readonly _logger = new Logger(TransactionRepository.name);
  constructor(
    @InjectRepository(Transaction)
    private readonly repos: Repository<Transaction>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Transaction Repository ==============',
    );
  }

  async getLatestTransaction() {
    const transaction = await this.repos.findOne({ order: { height: 'DESC' } });
    return transaction;
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
