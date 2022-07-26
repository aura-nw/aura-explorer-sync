import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HistoryProposal } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class HistoryProposalRepository extends BaseRepository<HistoryProposal> {
  private readonly _logger = new Logger(HistoryProposalRepository.name);
  constructor(
    @InjectRepository(HistoryProposal)
    private readonly repos: Repository<HistoryProposal>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor History Proposal Repository ==============',
    );
  }
}
