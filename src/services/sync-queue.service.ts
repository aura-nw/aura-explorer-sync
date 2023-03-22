import { Injectable, Logger } from '@nestjs/common';
import { QUEUES, QUEUES_STATUS } from '../common/constants/app.constant';
import { QueueInfoRepository } from '../repositories/queue-info.repository';
import { SmartContractsProcessor } from '../processor/smart-contracts.processor';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class SyncQueueService {
  private readonly _logger = new Logger(SyncQueueService.name);
  constructor(
    private queueInfoRepository: QueueInfoRepository,
    private smartContractProcessor: SmartContractsProcessor,
    private validatorProcessor: ValidatorProcessor,
  ) {
    this._logger.log(
      '============== Constructor Sync Queue Service ==============',
    );
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async syncFailedQueue() {
    this._logger.log(`${this.syncFailedQueue.name} was called!`);
    const data = await this.queueInfoRepository.find({
      status: QUEUES_STATUS.FAILED,
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
      switch (queue.job_name) {
        case QUEUES.SYNC_EXECUTE_CONTRACTS:
          this.smartContractProcessor.handleExecuteContract(job);
          break;
        case QUEUES.SYNC_CW4973_NFT_STATUS:
          this.smartContractProcessor.handleSyncCw4973NftStatus(job);
          break;
        case QUEUES.SYNC_INSTANTIATE_CONTRACTS:
          this.smartContractProcessor.handleInstantiateContract(job);
          break;
        case QUEUES.SYNC_PRICE_VOLUME:
          this.smartContractProcessor.handleSyncPriceVolume(job);
          break;
        case QUEUES.SYNC_COIN_ID:
          this.smartContractProcessor.handleSyncCoinId(job);
          break;
        case QUEUES.SYNC_CONTRACT_FROM_HEIGHT:
          this.smartContractProcessor.syncSmartContractFromHeight(job);
          break;
        case QUEUES.SYNC_VALIDATOR:
          this.validatorProcessor.syncValidator(job);
          break;
        case QUEUES.SYNC_CONTRACT_CODE:
          this.smartContractProcessor.synceMissingSmartContractCode(job);
          break;
        default:
          break;
      }
      await this.queueInfoRepository.updateQueueStatus(
        queue.job_id,
        queue.job_name,
        QUEUES_STATUS.SUCCESS,
      );
    });
  }
}
