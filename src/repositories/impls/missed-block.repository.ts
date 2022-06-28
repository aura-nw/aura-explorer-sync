import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ENTITIES_CONFIG } from "../../module.config";
import { Repository } from "typeorm";
import { IMissedBlockRepository } from "../imissed-block.repository";
import { BaseRepository } from "./base.repository";
import { MissedBlock } from "../../entities/missed-block.entity";

@Injectable()
export class MissedBlockRepository extends BaseRepository<MissedBlock> implements IMissedBlockRepository {
    private readonly _logger = new Logger(MissedBlockRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.MISSED_BLOCK)
        private readonly repos: Repository<MissedBlock>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Missed Block Repository ==============',
        );
    }
}