import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ENTITIES_CONFIG } from '../../module.config';
import { ObjectLiteral, Repository } from 'typeorm';
import { IMissedBlockRepository } from '../imissed-block.repository';
import { BaseRepository } from './base.repository';

@Injectable()
export class MissedBlockRepository
  extends BaseRepository
  implements IMissedBlockRepository
{
  private readonly _logger = new Logger(MissedBlockRepository.name);
  constructor(
    @InjectRepository(ENTITIES_CONFIG.MISSED_BLOCK)
    private readonly repos: Repository<ObjectLiteral>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Missed Block Repository ==============',
    );
  }
}
