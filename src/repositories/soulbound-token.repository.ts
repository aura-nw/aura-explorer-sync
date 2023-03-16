import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SoulboundToken } from '../entities/soulbound-token.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class SoulboundTokenRepository extends BaseRepository<SoulboundToken> {
  private readonly _logger = new Logger(SoulboundTokenRepository.name);
  constructor(
    @InjectRepository(SoulboundToken)
    private readonly repos: Repository<SoulboundToken>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor SoulboundToken Repository ==============',
    );
  }
}
