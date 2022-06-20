import { InjectQueue } from "@nestjs/bull";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Queue } from "bull";
import { InjectSchedule, Schedule } from "nest-schedule";
import { SERVICE_INTERFACE } from "../../module.config";
import { IBlockSyncErrorService } from "../../services/iblock-sync-error.service";
import { ISyncStatusService } from "../../services/isync-status.service";
import { CommonUtil } from "src/utils/common.util";
import { PROCESSOR_CONSTANTS, PROCESS_CONSTANTS } from "../constants/common.const";
import { ConfigService } from "../services/config.service";
import { BaseQueue } from "./base.queue";
import { Interval } from "@nestjs/schedule";

@Injectable()
export class SyncBlockQueue extends BaseQueue {

    private readonly _logger = new Logger(SyncBlockQueue.name);
    private rpc = '';
    private api = '';
    private currentBlock: number;
    private threads = 0;
    private jobPrefix = 'block_height_';

    constructor(@InjectQueue(PROCESSOR_CONSTANTS.SYNC_BLOCK) private queueSerive: Queue,
        private _commonUtil: CommonUtil,
        private configService: ConfigService,
        @InjectSchedule()
        private readonly schedule: Schedule,
        @Inject(SERVICE_INTERFACE.ISYNC_STATUS_SERVICE)
        private syncStatusService: ISyncStatusService,
        @Inject(SERVICE_INTERFACE.IBLOCK_SYNC_ERROR_SERVICE)
        private blockSyncErrorService: IBlockSyncErrorService) {
        super(queueSerive);

        this.rpc = this.configService.get('RPC');
        this.api = this.configService.get('API');

        // Get number thread from config
        this.threads = Number(this.configService.get('THREADS') || 15);

        this.workerProcess();
    }

    /**
     * workerProcess
     * @param height
     */
    async workerProcess(height: number = undefined) {

        this._logger.log(null, `Class ${SyncBlockQueue.name}, call workerProcess method`);

        let currentBlk = 0, latestBlk = 0;
        // Get blocks latest
        try {
            const blockLatest = await this.getBlockLatest();
            latestBlk = Number(blockLatest?.block?.header?.height || 0);

            if (height > 0) {
                currentBlk = height;

            } else {
                //Get current height
                const status: any = await this.syncStatusService.findOne({
                    order: { current_block: "ASC" }
                });
                if (status) {
                    currentBlk = status.current_block;
                }
            }
        } catch (err) {
            console.log(err)
        }

        this.threadProcess(currentBlk, latestBlk)
    }

    /**
    * getBlockLatest
    * @returns 
    */
    async getBlockLatest(): Promise<any> {
        this._logger.log(null, `Class ${SyncBlockQueue.name}, call getBlockLatest method`);

        const paramsBlockLatest = `blocks/latest`;
        const results = await this._commonUtil.getDataAPI(this.api, paramsBlockLatest);
        return results;
    }

    /**
    * threadProcess
    * @param currentBlk Current block
    * @param blockLatest The final block
    */
    threadProcess(currentBlk: number, latestBlk: number) {
        let loop = 0;
        let height = 0;
        try {
            let blockNotSync = latestBlk - currentBlk;
            if (blockNotSync > 0) {
                if (blockNotSync > this.threads) {
                    loop = this.threads;
                } else {
                    loop = blockNotSync;
                }

                // Create 10 thread to sync data      
                for (let i = 1; i <= loop; i++) {
                    height = currentBlk + i;
                    // Add data to job
                    this.addJob(`${this.jobPrefix}${height}`, PROCESS_CONSTANTS.EXECUTE_SYNC_BLOCK, height);
                }
            }
        } catch (error) {
            this._logger.log(null, `Call threadProcess method error: ${error.message}`);
        }

        // If current block not equal latest block when the symtem will call workerProcess method    
        this.schedule.scheduleIntervalJob(`schedule_recall_${(new Date()).getTime()}`, 1000, async () => {
            // Update code sync data
            this._logger.log(null, `Class ${SyncBlockQueue.name}, recall workerProcess method: ${height}`);
            this.workerProcess(height);

            // Close thread
            return true;
        });
    }

    /**
     * blockSyncError
     */
    @Interval(1000)
    async blockSyncError() {
        const result = await this.blockSyncErrorService.findOne({ order: { height: "ASC" } });
        if (result) {
            const height = result.height;
            this.addJob(`${this.jobPrefix}${height}`, PROCESS_CONSTANTS.EXECUTE_SYNC_BLOCK_ERROR, height);
        }
    }
}