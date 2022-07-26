import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockSyncError } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class BlockSyncErrorRepository extends BaseRepository<BlockSyncError> {
  private readonly _logger = new Logger(BlockSyncErrorRepository.name);
  constructor(
    @InjectRepository(BlockSyncError)
    private readonly repos: Repository<BlockSyncError>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Block Sync Error Repository ==============',
    );
  }
}
