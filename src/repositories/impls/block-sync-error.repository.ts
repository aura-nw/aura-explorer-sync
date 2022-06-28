import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ENTITIES_CONFIG } from "../../module.config";
import { ObjectLiteral, Repository } from "typeorm";
import { IBlockSyncErrorRepository } from "../iblock-sync-error.repository";
import { BaseRepository } from "./base.repository";
import { BlockSyncError } from "../../entities/block-sync-error.entity";

@Injectable()
export class BlockSyncErrorRepository extends BaseRepository<BlockSyncError> implements IBlockSyncErrorRepository {
    private readonly _logger = new Logger(BlockSyncErrorRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.BLOCK_SYNC_ERROR)
        private readonly repos: Repository<BlockSyncError>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Block Sync Error Repository ==============',
        );
    }
}