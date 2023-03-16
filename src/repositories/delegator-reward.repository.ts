import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DelegatorReward } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class DelegatorRewardRepository extends BaseRepository<DelegatorReward> {
  private readonly _logger = new Logger(DelegatorRewardRepository.name);
  constructor(
    @InjectRepository(DelegatorReward)
    private readonly repos: Repository<DelegatorReward>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Delegator Reward Repository ==============',
    );
  }
}
