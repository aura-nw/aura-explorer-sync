import { Inject } from "@nestjs/common";
import { SyncStatus } from "../../entities/sync-status.entity";
import { REPOSITORY_INTERFACE } from "../../module.config";
import { ISyncStatusRepository } from "../../repositories/isync-status.repository";
import { ISyncStatusService } from "../isync-status.service";
import { BaseService } from "./base.service";

export class SyncStatusService extends BaseService<SyncStatus> implements ISyncStatusService {
    constructor(
        @Inject(REPOSITORY_INTERFACE.ISYNC_STATUS_REPOSITORY)
        private statusRepository: ISyncStatusRepository,
    ) {
        super(statusRepository);
    }
}