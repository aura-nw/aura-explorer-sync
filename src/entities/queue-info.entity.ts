import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from './base/base.entity';

@Entity('queue_info')
export class QueueInfo extends BaseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({
    name: 'job_id',
  })
  job_id: number;

  @Column()
  height: number;

  @Column({
    name: 'job_name',
  })
  job_name: string;

  @Column({
    name: 'job_data',
    type: 'text',
  })
  job_data: string;

  @Column()
  status: string;

  @Column()
  processor: string;
}
