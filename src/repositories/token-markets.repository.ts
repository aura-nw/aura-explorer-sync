import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenMarkets } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class TokenMarketsRepository extends BaseRepository<TokenMarkets> {
  private readonly _logger = new Logger(TokenMarketsRepository.name);
  constructor(
    @InjectRepository(TokenMarkets)
    private readonly repos: Repository<TokenMarkets>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor CoingeckoMarkets Repository ==============',
    );
  }

  async countCw20TokensHavingCoinId() {
    const sqlSelect = `tm.contract_address, tm.coin_id`;

    const queryBuilder = this.repos
      .createQueryBuilder('tm')
      .select(sqlSelect)
      .where("tm.coin_id <> '' ")
      .andWhere("tm.coin_id <> 'aura-network' ");

    return await queryBuilder.getCount();
  }

  async getCw20TokenMarketsHavingCoinId(limit: number, pageIndex: number) {
    const sqlSelect = ` tm.coin_id`;

    const queryBuilder = this.repos
      .createQueryBuilder('tm')
      .select(sqlSelect)
      .where("tm.coin_id <> '' ")
      .andWhere("tm.coin_id <> 'aura-network' ")
      .limit(limit)
      .offset(pageIndex * limit);

    return await queryBuilder.getRawMany();
  }
}
