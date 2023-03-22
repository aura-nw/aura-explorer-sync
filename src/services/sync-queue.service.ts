import { Injectable, Logger } from '@nestjs/common';
import { QUEUES, QUEUES_STATUS } from '../common/constants/app.constant';
import { QueueInfoRepository } from '../repositories/queue-info.repository';
import { SmartContractsProcessor } from '../processor/smart-contracts.processor';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ValidatorProcessor } from '../processor/validator.processor';
import { ENV_CONFIG } from '../shared/services/config.service';

@Injectable()
export class SyncQueueService {
  private readonly _logger = new Logger(SyncQueueService.name);
  constructor(
    private queueInfoRepository: QueueInfoRepository,
    private smartContractProcessor: SmartContractsProcessor,
    private validatorProcessor: ValidatorProcessor,
    private threads = 0,
  ) {
    this._logger.log(
      '============== Constructor Sync Queue Service ==============',
    );
    this.threads = ENV_CONFIG.THREADS;
  }

  @Cron('0 */3 * * * *')
  async syncFailedQueue() {
    this._logger.log(`${this.syncFailedQueue.name} was called!`);
    const data = await this.queueInfoRepository.find({
      where: { status: QUEUES_STATUS.FAILED },
      take: this.threads,
    });

    data?.forEach(async (queue) => {
      this._logger.log(
        `Sync queue job_id: ${queue.job_id} and job_name: ${queue.job_name}!`,
      );
      const data = JSON.parse(queue?.job_data);
      const job = {
        id: queue.job_id,
        data: data,
        name: queue.job_name,
      };
      try {
        switch (queue.job_name) {
          case QUEUES.SYNC_EXECUTE_CONTRACTS:
            await this.smartContractProcessor.handleExecuteContract(job);
            break;
          case QUEUES.SYNC_CW4973_NFT_STATUS:
            await this.smartContractProcessor.handleSyncCw4973NftStatus(job);
            break;
          case QUEUES.SYNC_INSTANTIATE_CONTRACTS:
            await this.smartContractProcessor.handleInstantiateContract(job);
            break;
          case QUEUES.SYNC_PRICE_VOLUME:
            await this.smartContractProcessor.handleSyncPriceVolume(job);
            break;
          case QUEUES.SYNC_COIN_ID:
            await this.smartContractProcessor.handleSyncCoinId(job);
            break;
          case QUEUES.SYNC_CONTRACT_FROM_HEIGHT:
            await this.smartContractProcessor.syncSmartContractFromHeight(job);
            break;
          case QUEUES.SYNC_VALIDATOR:
            await this.validatorProcessor.syncValidator(job);
            break;
          case QUEUES.SYNC_CONTRACT_CODE:
            await this.smartContractProcessor.synceMissingSmartContractCode(
              job,
            );
            break;
          default:
            break;
        }
        await this.queueInfoRepository.updateQueueStatus(
          queue.job_id,
          queue.job_name,
          QUEUES_STATUS.SUCCESS,
        );
      } catch (error) {
        this._logger.error(
          `${this.syncFailedQueue.name} has error: ${error?.message}`,
          error?.stack,
        );
        throw error;
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
