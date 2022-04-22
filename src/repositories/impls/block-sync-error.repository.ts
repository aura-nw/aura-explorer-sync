import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ENTITIES_CONFIG } from "src/module.config";
import { ObjectLiteral, Repository } from "typeorm";
import { IBlockSyncErrorRepository } from "../iblock-sync-error.repository";
import { BaseRepository } from "./base.repository";

export class BlockSyncErrorRepository extends BaseRepository implements IBlockSyncErrorRepository {
    private readonly _logger = new Logger(BlockSyncErrorRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.BLOCK_SYNC_ERROR)
        private readonly repos: Repository<ObjectLiteral>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Block Sync Error Repository ==============',
        );
    }
}