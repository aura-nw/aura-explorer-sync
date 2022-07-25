import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { ENTITIES_CONFIG } from '../module.config';
import { BaseRepository } from './base.repository';

@Injectable()
export class BlockRepository extends BaseRepository {
  private readonly _logger = new Logger(BlockRepository.name);
  constructor(
    @InjectRepository(ENTITIES_CONFIG.BLOCK)
    private readonly repos: Repository<ObjectLiteral>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Block Repository ==============',
    );
  }
}
