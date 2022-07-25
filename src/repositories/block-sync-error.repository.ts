import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { ENTITIES_CONFIG } from '../module.config';
import { BaseRepository } from './base.repository';

@Injectable()
export class BlockSyncErrorRepository extends BaseRepository {
  private readonly _logger = new Logger(BlockSyncErrorRepository.name);
  constructor(
    @InjectRepository(ENTITIES_CONFIG.BLOCK_SYNC_ERROR)
    private readonly repos: Repository<ObjectLiteral>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Block Sync Error Repository ==============',
    );
  }
}
