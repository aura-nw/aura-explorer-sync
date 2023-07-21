import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BaseEntity } from './base/base.entity';

@Entity('block_sync_error')
@Unique(['height'])
export class BlockSyncError extends BaseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column()
  height: number;
}
