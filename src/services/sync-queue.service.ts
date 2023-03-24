import { Injectable, Logger } from '@nestjs/common';
import { QUEUES, QUEUES_PROCESSOR, QUEUES_STATUS } from '../common/constants/app.constant';
import { QueueInfoRepository } from '../repositories/queue-info.repository';
import { SmartContractsProcessor } from '../processor/smart-contracts.processor';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ValidatorProcessor } from '../processor/validator.processor';
import { ENV_CONFIG } from '../shared/services/config.service';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

@Injectable()
export class SyncQueueService {
  private readonly _logger = new Logger(SyncQueueService.name);
  private threads = 0;
  constructor(
    private queueInfoRepository: QueueInfoRepository,
    @InjectQueue('smart-contracts') private readonly contractQueue: Queue,
    @InjectQueue('validator') private readonly validatorQueue: Queue,
  ) {
    this._logger.log(
      '============== Constructor Sync Queue Service ==============',
    );
    this.threads = ENV_CONFIG.THREADS;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncFailedQueue() {
    this._logger.log(`${this.syncFailedQueue.name} was called!`);
    const jobs = await this.queueInfoRepository.find({
      where: { status: QUEUES_STATUS.FAILED },
      take: this.threads,
    });

    jobs?.forEach(async (job) => {
      this._logger.log(
        `Sync queue job_id: ${job.job_id} and job_name: ${job.job_name}!`,
      );
      try {
        let retryJob;
        if (job.processor === QUEUES_PROCESSOR.SMART_CONTRACTS) {
          retryJob = await this.contractQueue.getJob(job.job_id);
        } else if (job.processor === QUEUES_PROCESSOR.VALIDATOR) {
          retryJob = await this.validatorQueue.getJob(job.job_id);
        }
        if (retryJob?.isFailed) {
          await retryJob?.retry();
        }
      } catch (error) {
        this._logger.error(
          `${this.syncFailedQueue.name} has error: ${error?.message}`,
          error?.stack,
        );
      }
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async removeSuccessQueue() {
    this._logger.log(`${this.removeSuccessQueue.name} was called!`);
    const data = await this.queueInfoRepository.find({
      status: QUEUES_STATUS.SUCCESS,
    });
    if (data.length > 0) {
      await this.queueInfoRepository.remove(data);
    }
  }
}
