import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proposal } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class ProposalRepository extends BaseRepository<Proposal> {
  private readonly _logger = new Logger(ProposalRepository.name);
  constructor(
    @InjectRepository(Proposal)
    private readonly repos: Repository<Proposal>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Proposal Repository ==============',
    );
  }
}
