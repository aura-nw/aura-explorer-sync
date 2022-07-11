import { Column, Entity } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('block_sync_error')
export class BlockSyncError extends BaseEntityIncrementId {
  @Column({ name: 'height' })
  height: number;

  @Column({ name: 'block_hash' })
  block_hash: string;
}
