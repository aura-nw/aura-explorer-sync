import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProposalVote } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class ProposalVoteRepository extends BaseRepository<ProposalVote> {
  private readonly _logger = new Logger(ProposalVoteRepository.name);
  constructor(
    @InjectRepository(ProposalVote)
    private readonly repos: Repository<ProposalVote>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Proposal Vote Repository ==============',
    );
  }
}
