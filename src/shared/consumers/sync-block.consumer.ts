import { Processor, Process, OnGlobalQueueFailed, OnQueueFailed, OnGlobalQueueError, OnQueueError} from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { IBlockSyncErrorService } from 'src/services/iblock-sync-error.service';
import { SERVICE_INTERFACE } from '../../module.config';
import { ISyncTaskService } from '../../services/isync-task.service';
import { BLOCK_SYNC_ERROR_STATUS_CONSTANTS, PROCESSOR_CONSTANTS, PROCESS_CONSTANTS } from '../../common/constants/common.const';
import { ENV_CONFIG } from '../services/config.service';

@Processor(PROCESSOR_CONSTANTS.SYNC_BLOCK)
export class SyncBlockConsumer {

    private readonly _logger = new Logger(SyncBlockConsumer.name);

    constructor(
        @Inject(SERVICE_INTERFACE.ISYNC_TASK_SERVICE)
        private syncTaskService: ISyncTaskService,
        @Inject(SERVICE_INTERFACE.IBLOCK_SYNC_ERROR_SERVICE)
        private blockSyncErrorService: IBlockSyncErrorService,
    ) {
        this._logger.log(`============== Class ${SyncBlockConsumer.name} Constructor ==============`);
    }

    @Process({ name: PROCESS_CONSTANTS.EXECUTE_SYNC_BLOCK, concurrency: ENV_CONFIG.THREADS.THREADS_BLOCK })
    async executeSyncBlock(job: Job<unknown>) {
        const height: number = Number(job.data);
        this._logger.log(`============== Class ${SyncBlockConsumer.name} Call ExecuteSyncBlock method with height: ${height}==============`);
        if (height) {
            const status = job.getState();
            await this.syncTaskService.handleSyncData(height, false);
        }
    }
}