import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MissedBlock } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class MissedBlockRepository extends BaseRepository<MissedBlock> {
  private readonly _logger = new Logger(MissedBlockRepository.name);
  constructor(
    @InjectRepository(MissedBlock)
    private readonly repos: Repository<MissedBlock>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Missed Block Repository ==============',
    );
  }
}
