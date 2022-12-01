import { Column, Entity } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('token_markets')
export class TokenMarkets extends BaseEntityIncrementId {
  @Column({ name: 'contract_address' })
  contract_address: string;

  @Column({ name: 'coin_id' })
  coin_id: string;

  @Column()
  symbol: string;

  @Column()
  name: string;

  @Column()
  image: string;

  @Column({
    name: 'max_supply',
    type: 'decimal',
    precision: 38,
    scale: 6,
    default: 0,
  })
  max_supply: number;

  @Column({
    name: 'current_price',
    type: 'decimal',
    precision: 38,
    scale: 6,
    default: 0,
  })
  current_price: number;

  @Column({
    name: 'price_change_percentage_24h',
    type: 'float',
    default: 0,
  })
  price_change_percentage_24h: number;

  @Column({
    name: 'total_volume',
    type: 'decimal',
    precision: 38,
    scale: 6,
    default: 0,
  })
  total_volume: number;

  @Column({
    name: 'circulating_supply',
    type: 'decimal',
    precision: 38,
    scale: 6,
    default: 0,
  })
  circulating_supply: number;

  @Column({
    name: 'circulating_market_cap',
    type: 'decimal',
    precision: 38,
    scale: 6,
    default: 0,
  })
  circulating_market_cap: number;

  @Column({ type: 'text' })
  description: string;

  @Column({
    name: 'market_cap',
    type: 'decimal',
    precision: 38,
    scale: 6,
    default: 0,
  })
  market_cap: number;

  @Column({
    name: 'fully_diluted_valuation',
    type: 'decimal',
    precision: 38,
    scale: 6,
    default: 0,
  })
  fully_diluted_valuation: number;
}
