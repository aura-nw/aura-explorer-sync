import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BaseEntity } from './base/base.entity';

@Entity('queue_info')
export class QueueInfo extends BaseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column()
  type: string;

  @Column({
    name: 'job_data',
    type: 'text',
  })
  job_data: string;

  @Column()
  status: boolean;
}
