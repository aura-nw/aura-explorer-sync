import { Column, Entity, OneToMany, Unique } from 'typeorm';

import { BaseEntityIncrementId } from './base/base.entity';
import { Transaction } from './transaction.entity';

@Entity('blocks')
export class Block extends BaseEntityIncrementId {
  @Unique('block_hash', ['block_hash'])
  @Column()
  block_hash: string;

  @Column({ default: '' })
  chainid: string;

  @Column()
  height: number;

  @Column({ default: '' })
  identity: string;

  @Column({ default: '' })
  moniker: string;

  @Column({ default: 0 })
  num_signatures: number;

  @Column({ default: 0 })
  num_txs: number;

  @Column({ default: '' })
  operator_address: string;

  @Column({ default: '' })
  proposer: string;

  @Column()
  timestamp: Date;

  @Column({ default: 0 })
  gas_used: number;

  @Column({ default: 0 })
  gas_wanted: number;

  @Column({ default: 0 })
  round: number;

  @OneToMany(() => Transaction, (tx) => tx.block)
  txs: Transaction[];
}
