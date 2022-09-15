import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmartContractCode } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class SmartContractCodeRepository extends BaseRepository<SmartContractCode> {
  private readonly _logger = new Logger(SmartContractCodeRepository.name);
  constructor(
    @InjectRepository(SmartContractCode)
    private readonly repos: Repository<SmartContractCode>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Smart Contract Code Repository ==============',
    );
  }
}
