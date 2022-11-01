import { Column, Entity } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('coingecko_markets')
export class CoingeckoMarkets extends BaseEntityIncrementId {
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

  @Column({ name: 'max_supply', default: 0 })
  max_supply: number;

  @Column({
    name: 'current_price',
    type: 'decimal',
    precision: 30,
    scale: 6,
    default: 0,
  })
  current_price: number;

  @Column({
    name: 'price_change_percentage_24h',
    type: 'decimal',
    precision: 30,
    scale: 6,
    default: 0,
  })
  price_change_percentage_24h: number;

  @Column({ name: 'total_volume', type: 'bigint', default: 0 })
  total_volume: number;

  @Column({ name: 'circulating_supply', default: 0 })
  circulating_supply: number;

  @Column({ type: 'decimal', precision: 30, scale: 6, default: 0 })
  holders: number;

  @Column({ name: 'holders_change_percentage_24h', type: 'float', default: 0 })
  holders_change_percentage_24h: number;
}
