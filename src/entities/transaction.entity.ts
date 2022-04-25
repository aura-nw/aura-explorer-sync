import { json } from 'stream/consumers';
import { Column, Entity, ManyToOne, Unique } from 'typeorm';

import { BaseEntityIncrementId } from './base/base.entity';
import { Block } from './block.entity';

@Entity('transactions')
export class Transaction extends BaseEntityIncrementId {
  @Unique('tx_hash', ['tx_hash'])
  @Column({ name: 'tx_hash' })
  tx_hash: string;

  // contain an application-specific response code
  @Column({ 
    default: 0,
    name: 'code',
  })
  code: number;

  // namespace for the code
  @Column({ 
    default: '',
    name: 'codespace',
  })
  codespace: string;

  @Column({ 
    default: '',
    name: 'data',
  })
  data: string;

  @Column({ 
    default: 0,
    name: 'gas_used',
  })
  gas_used: number;

  @Column({ 
    default: 0,
    name: 'gas_wanted',
  })
  gas_wanted: number;

  @Column({ name: 'height' })
  height: number;

  @Column({ 
    default: '',
    name: 'info',
  })
  info: string;

  @Column({ 
    type: 'text',
    name: 'type',
  })
  type: string;

  @Column({ 
    type: 'text',
    name: 'raw_log',
  })
  raw_log: string;

  @Column({ name: 'timestamp' })
  timestamp: Date;

  @Column({ 
    type: 'json',
    name: 'tx',
  })
  tx: any;

  @Column({ 
    type: 'text',
    name: 'blockId',
  })
  blockId: number;

  @Column({ 
    type: 'text',
    name: 'fee',
  })
  fee: string;

  @Column({ 
    type: 'json',
    name: 'messages',
  })
  messages: any;

  @ManyToOne(() => Block, (block) => block.txs, { eager: true })
  block: Block;
}
