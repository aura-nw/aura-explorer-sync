import { Column, Entity } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('sync_status')
export class SyncStatus extends BaseEntityIncrementId {
  @Column()
  current_block: number;
}
