import { Column, Entity, PrimaryColumn } from 'typeorm';
import { BaseEntity } from './base/base.entity';

@Entity('token_markets')
export class TokenMarkets extends BaseEntity {
  @PrimaryColumn({ name: 'contract_address' })
  contract_address: string;

  @PrimaryColumn({ name: 'coin_id' })
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

  @Column({ name: 'current_holder' })
  current_holder: number;

  @Column({ name: 'holder_change_percentage_24h', type: 'float', default: 0 })
  holder_change_percentage_24h;

  @Column({ type: 'text' })
  description: string;
}
