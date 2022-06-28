import { Processor, Process, OnGlobalQueueFailed, OnQueueFailed, OnGlobalQueueError, OnQueueError} from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { IBlockSyncErrorService } from '../../services/iblock-sync-error.service';
import { SERVICE_INTERFACE } from '../../module.config';
import { ISyncTaskService } from '../../services/isync-task.service';
import { BLOCK_SYNC_ERROR_STATUS_CONSTANTS, PROCESSOR_CONSTANTS, PROCESS_CONSTANTS } from '../../common/constants/common.const';
import { ENV_CONFIG } from '../services/config.service';

@Processor(PROCESSOR_CONSTANTS.BLOCK_SYNC_ERROR)
export class BlockSyncErrorConsumer {

    private readonly _logger = new Logger(BlockSyncErrorConsumer.name);

    constructor(
        @Inject(SERVICE_INTERFACE.ISYNC_TASK_SERVICE)
        private syncTaskService: ISyncTaskService,
        @Inject(SERVICE_INTERFACE.IBLOCK_SYNC_ERROR_SERVICE)
        private blockSyncErrorService: IBlockSyncErrorService,
    ) {
        this._logger.log(`============== Class ${BlockSyncErrorConsumer.name} Constructor ==============`);
    }

    @Process({ name: PROCESS_CONSTANTS.EXECUTE_SYNC_BLOCK_ERROR, concurrency: ENV_CONFIG.THREADS.THREADS_BLOCK_SYNC_ERROR })
    async executeSyncBlockError(job: Job<unknown>) {
        const height: number = Number(job.data);
        this._logger.log(`============== Class ${BlockSyncErrorConsumer.name} Call executeSyncBlockError method with height: ${height}==============`);
        if (height) {
            await this.syncTaskService.handleSyncData(height, true);
        }
    }

    @OnGlobalQueueFailed()
    async executeFailed(job: Job, err: Error) {
        const height = parseInt(String(job));
        this._logger.log(`============== Class ${BlockSyncErrorConsumer.name} Call executeFailed method with height: ${height}==============`);
        if (height) {
            const find = await this.blockSyncErrorService.findOne({ where: { height } });
            if (find) {
                find.message = err.message;
                if (find.retry_times === ENV_CONFIG.JOB_OPTIONS.RETRY_TIME) {
                    find.status = BLOCK_SYNC_ERROR_STATUS_CONSTANTS.ERROR;
                    await job.remove();
                }else{
                    await job.retry();
                }            
                await this.blockSyncErrorService.update(find);
            }
        }
    }
}