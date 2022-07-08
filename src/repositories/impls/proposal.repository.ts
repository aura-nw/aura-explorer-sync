import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ENTITIES_CONFIG } from '../../module.config';
import { ObjectLiteral, Repository } from 'typeorm';
import { IProposalRepository } from '../iproposal.repository';
import { BaseRepository } from './base.repository';

@Injectable()
export class ProposalRepository
  extends BaseRepository
  implements IProposalRepository
{
  private readonly _logger = new Logger(ProposalRepository.name);
  constructor(
    @InjectRepository(ENTITIES_CONFIG.PROPOSAL)
    private readonly repos: Repository<ObjectLiteral>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Proposal Repository ==============',
    );
  }

  async deleteProposals() {
    const sql = `UPDATE proposals SET is_delete = 1 WHERE pro_status = 'PROPOSAL_STATUS_DEPOSIT_PERIOD' AND is_delete = 0 AND (current_timestamp()) > pro_deposit_end_time`;
    return await this.repos.query(sql, []);
  }
}
