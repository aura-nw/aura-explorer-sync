import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DeploymentRequests } from "../entities/deployment-requests.entity";
import { Repository } from "typeorm";
import { BaseRepository } from "./base.repository";

export class DeploymentRequestsRepository extends BaseRepository<DeploymentRequests> {
    private readonly _logger = new Logger(DeploymentRequestsRepository.name);
    constructor(
        @InjectRepository(DeploymentRequests)
        private readonly repos: Repository<DeploymentRequests>,
    ) {
        super(repos);
        this._logger.log('============== Constructor Deployment Requests Repository ==============');
    }
}