import { Column, Entity, Unique } from 'typeorm';

import { BaseEntityIncrementId } from './base/base.entity';

@Entity('delegations')
@Unique(['tx_hash', 'delegator_address', 'validator_address'])
export class Delegation extends BaseEntityIncrementId {
  @Column({ name: 'delegator_address', update: false })
  delegator_address: string;

  @Column({
    default: '',
    name: 'validator_address',
    update: true
  })
  validator_address: string;

  @Column({
    default: '',
    name: 'shares',
  })
  shares: string;

  @Column({
    type: 'float',
    name: 'amount',
  })
  amount: number;

  @Column({ name: 'tx_hash', update: true })
  tx_hash: string;

  @Column({ name: 'type' })
  type: string;
}
