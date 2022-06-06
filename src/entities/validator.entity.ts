import { Column, Entity, Unique } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('validators')
export class Validator extends BaseEntityIncrementId {
  @Unique('operator_address', ['operator_address'])
  @Column({ name: 'operator_address', update: false })
  operator_address: string;

  @Column({ 
    default: '',
    name: 'acc_address',  
  })
  acc_address: string;

  @Column({ 
    default: '',
    name: 'cons_address',
  })
  cons_address: string;

  @Column({ 
    default: '',
    name: 'cons_pub_key',
  })
  cons_pub_key: string;

  @Column({ 
    default: '',
    name: 'title',
  })
  title: string;

  @Column({ 
    default: false,
    name: 'jailed',
  })
  jailed: boolean;

  @Column({ 
    type: 'text',
    name: 'commission',
  })
  commission: string;

  @Column({ 
    type: 'text',
    name: 'max_commission',
  })
  max_commission: string;

  @Column({ 
    type: 'text',
    name: 'max_change_rate',
  })
  max_change_rate: string;

  @Column({ 
    default: 0,
    name: 'min_self_delegation',
  })
  min_self_delegation: number;

  @Column({ 
    type: 'text',
    name: 'delegator_shares',
  })
  delegator_shares: string;

  @Column({ 
    type: 'float',
    name: 'power',
  })
  power: number;

  @Column({ 
    default: '',
    name: 'percent_power',
  })
  percent_power: string;

  @Column({ 
    type: 'float',
    name: 'self_bonded',
  })
  self_bonded: number;

  @Column({ 
    default: '',
    name: 'percent_self_bonded',
  })
  percent_self_bonded: string;

  @Column({ 
    default: '',
    name: 'website',
  })
  website: string;

  @Column({ 
    default: '',
    name: 'details',
  })
  details: string;

  @Column({ 
    default: '',
    name: 'identity',
  })
  identity: string;

  @Column({ 
    default: '',
    name: 'unbonding_height',
  })
  unbonding_height: string;

  @Column({ name: 'unbonding_time' })
  unbonding_time: Date;

  @Column({ name: 'update_time' })
  update_time: Date;

  @Column({ 
    default: 0,
    name: 'up_time',
  })
  up_time: string;

  @Column({ 
    default: 0,
    name: 'status',
  })
  status: number;
}
