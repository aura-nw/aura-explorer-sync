import { Column, Entity, Unique } from 'typeorm';

import { BaseEntityIncrementId } from './base/base.entity';

@Entity('delegations')
export class Delegation extends BaseEntityIncrementId {
  @Column({ name: 'delegator_address' })
  delegator_address: string;

  @Column({ 
    default: '',
    name: 'validator_address',
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

  @Column({ name: 'tx_hash' })
  tx_hash: string;

  @Column({ name: 'type' })
  type: string;
}
