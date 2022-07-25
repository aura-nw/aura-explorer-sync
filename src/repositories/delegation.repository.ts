import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { ENTITIES_CONFIG } from '../module.config';
import { BaseRepository } from './base.repository';

@Injectable()
export class DelegationRepository extends BaseRepository {
  private readonly _logger = new Logger(DelegationRepository.name);
  constructor(
    @InjectRepository(ENTITIES_CONFIG.DELEGATION)
    private readonly repos: Repository<ObjectLiteral>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Delegation Repository ==============',
    );
  }
}
