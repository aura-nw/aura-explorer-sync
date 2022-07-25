import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { ENTITIES_CONFIG } from '../module.config';
import { BaseRepository } from './base.repository';

@Injectable()
export class HistoryProposalRepository extends BaseRepository {
  private readonly _logger = new Logger(HistoryProposalRepository.name);
  constructor(
    @InjectRepository(ENTITIES_CONFIG.HISTORY_PROPOSAL)
    private readonly repos: Repository<ObjectLiteral>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor History Proposal Repository ==============',
    );
  }
}
