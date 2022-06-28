import { OnGlobalQueueFailed, Process, Processor } from "@nestjs/bull";
import { Inject, Logger } from "@nestjs/common";
import { Job } from "bull";
import { SERVICE_INTERFACE } from "../../module.config";
import { ISyncTaskService } from "../../services/isync-task.service";
import { PROCESSOR_CONSTANTS, PROCESS_CONSTANTS } from "../../common/constants/common.const";

@Processor(PROCESSOR_CONSTANTS.SYNC_MISSED_BLOCK)
export class SyncMissedBlockConsumer {
    private readonly _logger = new Logger(SyncMissedBlockConsumer.name);
    constructor(
        @Inject(SERVICE_INTERFACE.ISYNC_TASK_SERVICE)
        private syncTaskService : ISyncTaskService
    ){
        this._logger.log(`============== Class ${SyncMissedBlockConsumer.name} Constructor ==============`);
    }

    @Process({ name: PROCESS_CONSTANTS. EXECUTE_SYNC_MISSED_BLOCK})
    async executeSyncMissedBlock(job: Job<unknown>) {
        const height: number = Number(job.data);
        this._logger.log(`============== Class ${SyncMissedBlockConsumer.name} Call executeSyncMissedBlock method with height: ${height}==============`);
        if (height) {
            await this.syncTaskService.syncMissedBlock(height);
        }
    }
}