import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delegation } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class DelegationRepository extends BaseRepository<Delegation> {
  private readonly _logger = new Logger(DelegationRepository.name);
  constructor(
    @InjectRepository(Delegation)
    private readonly repos: Repository<Delegation>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Delegation Repository ==============',
    );
  }
}
