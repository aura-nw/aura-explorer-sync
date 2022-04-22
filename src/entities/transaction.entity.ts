import { json } from 'stream/consumers';
import { Column, Entity, ManyToOne, Unique } from 'typeorm';

import { BaseEntityIncrementId } from './base/base.entity';
import { Block } from './block.entity';

@Entity('transactions')
export class Transaction extends BaseEntityIncrementId {
  @Unique('tx_hash', ['tx_hash'])
  @Column()
  tx_hash: string;

  // contain an application-specific response code
  @Column({ default: 0 })
  code: number;

  // namespace for the code
  @Column({ default: '' })
  codespace: string;

  @Column({ default: '' })
  data: string;

  @Column({ default: 0 })
  gas_used: number;

  @Column({ default: 0 })
  gas_wanted: number;

  @Column()
  height: number;

  @Column({ default: '' })
  info: string;

  @Column({ default: '' })
  type: string;

  @Column({ type: 'text' })
  raw_log: string;

  @Column()
  timestamp: Date;

  @Column({ type: 'json' })
  tx: any;

  @Column({ type: 'text' })
  blockId: number;

  @Column({ type: 'text' })
  fee: string;

  @Column({ type: 'json' })
  messages: any;

  @ManyToOne(() => Block, (block) => block.txs, { eager: true })
  block: Block;
}
