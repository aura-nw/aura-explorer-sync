import { JobOptions, Queue } from "bull";
import { v4 as uuidv4 } from 'uuid';
import { ENV_CONFIG } from "../services/config.service";

export class BaseQueue {
    private _queue: Queue;
    constructor(private queue: Queue) {
        this._queue = queue;
    }


    /**
     * addJob
     * @param jobId Id's job run
     * @param name Methoad's name process job in the comsumer
     * @param data Data to process
     */
    public async addJob(jobId: string, name: string, data: any) {
        const job = await this._queue.getJob(jobId);
        if (!job) {
            this._queue.add(name, data, this.configOptions(jobId));
        }
    }

    /**
     * configOptions
     * @returns 
     */
    private configOptions(jobId: string) {
        const jobOptions: JobOptions = {
            jobId: `${jobId}`,
            removeOnComplete: true,
            backoff: ENV_CONFIG.JOB_OPTIONS.BACK_OFF, // Time to execute again
            attempts: ENV_CONFIG.JOB_OPTIONS.ATTEMPTS // Number of time to retry job
        };

        return jobOptions;
    }
}