import { CONTRACT_TYPE } from '../common/constants/app.constant';
import { Column, Entity } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('token_contracts')
export class TokenContract extends BaseEntityIncrementId {
  @Column({
    name: 'type',
    type: 'enum',
    enum: CONTRACT_TYPE,
  })
  type: CONTRACT_TYPE;

  @Column({ name: 'name' })
  name: string;

  @Column({ name: 'symbol' })
  symbol: string;

  @Column({ name: 'image' })
  image: string;

  @Column({ name: 'description' })
  description: string;

  @Column({ name: 'contract_address' })
  contract_address: string;

  @Column({ name: 'decimals' })
  decimals: number;

  @Column({ name: 'num_tokens' })
  num_tokens: number;

  @Column({ name: 'coin_id' })
  coin_id: string;

  @Column({ name: 'max_total_supply' })
  max_total_supply: number;

  @Column({ name: 'price' })
  price: number;

  @Column({ name: 'price_change_percentage_24h' })
  price_change_percentage_24h: number;

  @Column({ name: 'volume_24h' })
  volume_24h: number;

  @Column({ name: 'circulating_market_cap' })
  circulating_market_cap: number;

  @Column({ name: 'fully_diluted_market_cap' })
  fully_diluted_market_cap: number;

  @Column({ name: 'holders' })
  holders: number;

  @Column({ name: 'holders_change_percentage_24h' })
  holders_change_percentage_24h: number;
}
