import { Column, Entity, PrimaryColumn } from 'typeorm';
import { BaseEntity } from './base/base.entity';

@Entity('sync_transactions')
export class SyncTransaction extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', name: 'tx_hash' })
  tx_hash: string;

  @Column({ type: 'int', name: 'height' })
  height: number;

  @Column({ type: 'varchar', name: 'type' })
  type: string;

  @Column({ type: 'varchar', name: 'contract_address' })
  contract_address: string;

  @Column({ type: 'varchar', name: 'from_address' })
  from_address: string;

  @Column({ type: 'varchar', name: 'to_address' })
  to_address: string;

  @Column({ type: 'decimal', name: 'amount' })
  amount: string;

  @Column({ type: 'decimal', name: 'fee' })
  fee: string;

  @Column({ type: 'datetime', name: 'timestamp' })
  timestamp: Date;
}
