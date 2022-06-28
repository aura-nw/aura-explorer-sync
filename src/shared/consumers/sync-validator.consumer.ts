import { Processor, Process, OnGlobalQueueFailed, OnQueueFailed, OnGlobalQueueError, OnQueueError } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SERVICE_INTERFACE } from '../../module.config';
import { ISyncTaskService } from '../../services/isync-task.service';
import { PROCESSOR_CONSTANTS, PROCESS_CONSTANTS } from '../../common/constants/common.const';
import { ENV_CONFIG } from '../services/config.service';

@Processor(PROCESSOR_CONSTANTS.SYNC_VALIDATOR)
export class SyncValidatorConsumer {

    private readonly _logger = new Logger(SyncValidatorConsumer.name);

    constructor(
        @Inject(SERVICE_INTERFACE.ISYNC_TASK_SERVICE)
        private syncTaskService: ISyncTaskService,
    ) {
        this._logger.log(`============== Class ${SyncValidatorConsumer.name} Constructor ==============`);
    }

    @Process({ name: PROCESS_CONSTANTS.EXECUTE_SYNC_VALIDATOR, concurrency: ENV_CONFIG.THREADS.THREADS_SYNC_VALIDATOR})
    async executeSyncValidators(job: Job<unknown>) {
        const validdtors = job.data as Array<any>;
        
        this._logger.log(`============== Class ${SyncValidatorConsumer.name} Call executeSyncValidators method ==============`);
        if (validdtors) {
            await this.syncTaskService.syncValidator(validdtors);
        }
    }
}