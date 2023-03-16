import { Column, Entity, Unique } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('delegator_rewards')
@Unique(['tx_hash', 'delegator_address', 'validator_address'])
export class DelegatorReward extends BaseEntityIncrementId {
  @Column({ name: 'delegator_address', update: false })
  delegator_address: string;

  @Column({ name: 'validator_address', update: false })
  validator_address: string;

  @Column({ name: 'amount' })
  amount: number;

  @Column({ name: 'tx_hash', update: false })
  tx_hash: string;
}
