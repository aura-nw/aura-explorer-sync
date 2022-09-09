import { Process, Processor } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";

@Processor('smart-contracts')
export class SmartContractsProcessor {
    private readonly logger = new Logger(SmartContractsProcessor.name);

    @Process('sync-instantiate-contracts')
    async handleInstantiateContract(job: Job) {
        this.logger.debug('Start transcoding...');
        this.logger.debug(job.data);
        this.logger.debug('Transcoding completed');
    }
}