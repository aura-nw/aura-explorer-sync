import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { ENTITIES_CONFIG } from '../module.config';
import { BaseRepository } from './base.repository';

@Injectable()
export class SmartContractCodeRepository extends BaseRepository {
  private readonly _logger = new Logger(SmartContractCodeRepository.name);
  constructor(
    @InjectRepository(ENTITIES_CONFIG.SMART_CONTRACT_CODE)
    private readonly repos: Repository<ObjectLiteral>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Smart Contract Code Repository ==============',
    );
  }
}
