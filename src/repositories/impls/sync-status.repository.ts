import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ENTITIES_CONFIG } from "../../module.config";
import { Repository } from "typeorm";
import { ISyncStatusRepository } from "../isync-status.repository";
import { BaseRepository } from "./base.repository";
import { SyncStatus } from "../../entities/sync-status.entity";

@Injectable()
export class SyncStatusRepository extends BaseRepository<SyncStatus> implements ISyncStatusRepository {
    private readonly _logger = new Logger(SyncStatusRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.SYNC_STATUS)
        private readonly repos: Repository<SyncStatus>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Sync Status Repository ==============',
        );
    }
}