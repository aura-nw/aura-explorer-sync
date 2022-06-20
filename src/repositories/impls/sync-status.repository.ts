import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ENTITIES_CONFIG } from "../../module.config";
import { ObjectLiteral, Repository } from "typeorm";
import { IDelegatorRewardRepository } from "../idelegator-reward.repository";
import { ISyncStatusRepository } from "../isync-status.repository";
import { BaseRepository } from "./base.repository";
import { BlockSyncError } from "../../entities/block-sync-error.entity";

@Injectable()
export class SyncStatusRepository extends BaseRepository implements ISyncStatusRepository {
    private readonly _logger = new Logger(SyncStatusRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.SYNC_STATUS)
        private readonly repos: Repository<BlockSyncError>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Sync Status Repository ==============',
        );
    }
}