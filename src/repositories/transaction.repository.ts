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
}
