import { Processor, Process, OnGlobalQueueFailed, OnQueueFailed, OnGlobalQueueError, OnQueueError } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SERVICE_INTERFACE } from '../../module.config';
import { ISyncTaskService } from '../../services/isync-task.service';
import { PROCESSOR_CONSTANTS, PROCESS_CONSTANTS } from '../../common/constants/common.const';
import { ENV_CONFIG } from '../services/config.service';
import { ISyncProposalService } from 'src/services/isync-proposal.service';

@Processor(PROCESSOR_CONSTANTS.SYNC_PROPOSAL)
export class SyncProposalConsumer {

    private readonly _logger = new Logger(SyncProposalConsumer.name);

    constructor(
        @Inject(SERVICE_INTERFACE.ISYNC_PROPOSAL_SERVICE)
        private syncProposalService: ISyncProposalService,
    ) {
        this._logger.log(`============== Class ${SyncProposalConsumer.name} Constructor ==============`);
    }

    @Process({ name: PROCESS_CONSTANTS.EXECUTE_SYNC_PROPOSAL, concurrency: ENV_CONFIG.THREADS.THREADS_SYNC_PROPOSAL})
    async executeSyncProposal(job: Job<unknown>) {
        const proposals = job.data as Array<any>;
        
        this._logger.log(`============== Class ${SyncProposalConsumer.name} Call executeSyncProposal method ==============`);
        if (proposals) {
            await this.syncProposalService.syncProposals(proposals);
        }
    }
}