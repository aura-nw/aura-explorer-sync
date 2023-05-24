import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueError,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

export class BaseProcessor {
  protected logger = new Logger(this.constructor.name);

  constructor() {
    this.logger.log(
      `============== Constructor ${this.constructor.name} ============== `,
    );
  }
  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id} of type ${job.name}...`);
  }

  @OnQueueCompleted()
  async onComplete(job: Job) {
    this.logger.log(`Completed job ${job.id} of type ${job.name}`);
  }

  @OnQueueError()
  onError(job: Job, error: Error) {
    this.logger.error(`Error job ${job.id} of type ${job.name}`);
    this.logger.error(error.stack);
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}`);
    this.logger.error(error.stack);
  }
}
