import { Column, Entity, Unique } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('validators')
export class Validator extends BaseEntityIncrementId {
  @Unique('operator_address', ['operator_address'])
  @Column()
  operator_address: string;

  @Column({ default: '' })
  acc_address: string;

  @Column({ default: '' })
  cons_address: string;

  @Column({ default: '' })
  cons_pub_key: string;

  @Column({ default: '' })
  title: string;

  @Column({ default: false })
  jailed: boolean;

  @Column({ type: 'text' })
  commission: string;

  @Column({ type: 'text' })
  max_commission: string;

  @Column({ type: 'text' })
  max_change_rate: string;

  @Column({ default: 0 })
  min_self_delegation: number;

  @Column({ type: 'text' })
  delegator_shares: string;

  @Column({ type: 'float' })
  power: number;

  @Column({ default: '' })
  percent_power: string;

  @Column({ type: 'float' })
  self_bonded: number;

  @Column({ default: '' })
  percent_self_bonded: string;

  @Column({ default: '' })
  website: string;

  @Column({ default: '' })
  details: string;

  @Column({ default: '' })
  identity: string;

  @Column({ default: '' })
  unbonding_height: string;

  @Column()
  unbonding_time: Date;

  @Column()
  update_time: Date;

  @Column({ default: 0 })
  up_time: string;

  @Column({ default: 0 })
  status: number;
}
