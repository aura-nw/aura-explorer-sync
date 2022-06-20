import { Processor, Process, OnGlobalQueueFailed, OnGlobalQueueCompleted } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SERVICE_INTERFACE } from '../../module.config';
import { ISyncTaskService } from '../../services/isync-task.service';
import { PROCESSOR_CONSTANTS, PROCESS_CONSTANTS } from '../constants/common.const';
import { ConfigService, ENV_CONFIG } from '../services/config.service';

@Processor(PROCESSOR_CONSTANTS.SYNC_BLOCK)
export class SyncBlockConsumer {

    private readonly _logger = new Logger(SyncBlockConsumer.name);

    constructor(
        @Inject(SERVICE_INTERFACE.ISYNC_TASK_SERVICE)
        private syncTaskService: ISyncTaskService,
    ) {
        this._logger.log("============== Constructor SyncBlockConsumer ==============");
    }

    @Process({ name: PROCESS_CONSTANTS.EXECUTE_SYNC_BLOCK, concurrency: ENV_CONFIG.THREADS})
    async executeSyncBlock(job: Job<unknown>) {
        const height: number = Number(job.data);
        console.log(`============== Call ExecuteSyncBlock method with height: ${height}==============`);
        if (height) {
            await this.syncTaskService.handleSyncData(height, false);
        }
    }

    @Process({ name: PROCESS_CONSTANTS.EXECUTE_SYNC_BLOCK_ERROR, concurrency: 1 })
    async executeSyncBlockError(job: Job<unknown>) {
        const height: number = Number(job.data);
        console.log(`============== Call executeSyncBlockError method with height: ${height}==============`);
        if (height) {
            await this.syncTaskService.handleSyncData(height, true);
        }
    }
}