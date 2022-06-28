import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ENTITIES_CONFIG } from "../../module.config";
import { ObjectLiteral, Repository } from "typeorm";
import { IDelegatorRewardRepository } from "../idelegator-reward.repository";
import { BaseRepository } from "./base.repository";
import { DelegatorReward } from "../../entities/delegator-reward.entity";

@Injectable()
export class DelegatorRewardRepository extends BaseRepository<DelegatorReward> implements IDelegatorRewardRepository {
    private readonly _logger = new Logger(DelegatorRewardRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.DELEGATOR_REWARD)
        private readonly repos: Repository<DelegatorReward>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Delegator Reward Repository ==============',
        );
    }
}