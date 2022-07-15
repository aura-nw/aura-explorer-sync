import { Column, Entity, Unique } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('block_sync_error')
@Unique(['height'])
export class BlockSyncError extends BaseEntityIncrementId {
  @Column({ name: 'height' })
  height: number;

  @Column({ name: 'block_hash' })
  block_hash: string;
}
