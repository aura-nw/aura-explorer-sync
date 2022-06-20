import { Inject } from "@nestjs/common";
import { BlockSyncError } from "../../entities/block-sync-error.entity";
import { IBlockSyncErrorRepository } from "src/repositories/iblock-sync-error.repository";
import { REPOSITORY_INTERFACE } from "../../module.config";
import { IBlockSyncErrorService } from "../iblock-sync-error.service";
import { BaseService } from "./base.service";

export class BlockSyncErrorService extends BaseService<BlockSyncError> implements IBlockSyncErrorService{
    constructor(
        @Inject(REPOSITORY_INTERFACE.IBLOCK_SYNC_ERROR_REPOSITORY)
        private blockSyncErrorRepository: IBlockSyncErrorRepository,
    ) {
        super(blockSyncErrorRepository);
    }
}