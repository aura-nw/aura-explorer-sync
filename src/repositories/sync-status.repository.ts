import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncStatus } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class SyncStatusRepository extends BaseRepository<SyncStatus> {
  private readonly _logger = new Logger(SyncStatusRepository.name);
  constructor(
    @InjectRepository(SyncStatus)
    private readonly repos: Repository<SyncStatus>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Sync Status Repository ==============',
    );
  }
}
