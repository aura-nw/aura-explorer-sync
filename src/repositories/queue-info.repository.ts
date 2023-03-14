import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueInfo } from '../entities/queue-info.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class QueueInfoRepository extends BaseRepository<QueueInfo> {
  private readonly _logger = new Logger(QueueInfoRepository.name);
  constructor(
    @InjectRepository(QueueInfo)
    private readonly repos: Repository<QueueInfo>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Queue Info Repository ==============',
    );
  }

  public async updateQueueStatus(jobId, jobName, status) {
    return await this.repos
      .createQueryBuilder()
      .update(QueueInfo)
      .set({
        status: status,
      })
      .where('job_id = :jobId', { jobId })
      .andWhere('job_name = :jobName', { jobName })
      .execute();
  }
}
