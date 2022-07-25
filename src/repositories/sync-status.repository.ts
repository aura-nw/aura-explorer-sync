import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { ENTITIES_CONFIG } from '../module.config';
import { BaseRepository } from './base.repository';

@Injectable()
export class SyncStatusRepository extends BaseRepository {
  private readonly _logger = new Logger(SyncStatusRepository.name);
  constructor(
    @InjectRepository(ENTITIES_CONFIG.SYNC_STATUS)
    private readonly repos: Repository<ObjectLiteral>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Sync Status Repository ==============',
    );
  }
}
