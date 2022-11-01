import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoingeckoMarkets } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class CoingeckoMarketsRepository extends BaseRepository<CoingeckoMarkets> {
  private readonly _logger = new Logger(CoingeckoMarketsRepository.name);
  constructor(
    @InjectRepository(CoingeckoMarkets)
    private readonly repos: Repository<CoingeckoMarkets>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor CoingeckoMarkets Repository ==============',
    );
  }
}
