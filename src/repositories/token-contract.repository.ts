import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { ENTITIES_CONFIG } from '../module.config';
import { BaseRepository } from './base.repository';

@Injectable()
export class TokenContractRepository extends BaseRepository {
  private readonly _logger = new Logger(TokenContractRepository.name);
  constructor(
    @InjectRepository(ENTITIES_CONFIG.TOKEN_CONTRACT)
    private readonly repos: Repository<ObjectLiteral>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Token Contract Repository ==============',
    );
  }
}
