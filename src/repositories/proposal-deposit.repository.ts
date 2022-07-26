import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProposalDeposit } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class ProposalDepositRepository extends BaseRepository<ProposalDeposit> {
  private readonly _logger = new Logger(ProposalDepositRepository.name);
  constructor(
    @InjectRepository(ProposalDeposit)
    private readonly repos: Repository<ProposalDeposit>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Proposal Deposit Repository ==============',
    );
  }
}
