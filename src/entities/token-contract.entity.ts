import { Column, Entity } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('token_contracts')
export class TokenContract extends BaseEntityIncrementId {
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

  @Column({ name: 'total_supply' })
  total_supply: number;

  @Column({ name: 'balance' })
  balance: number;

  @Column({ name: 'owner' })
  owner: string;
}
