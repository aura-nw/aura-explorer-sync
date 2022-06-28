import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ENTITIES_CONFIG } from "../../module.config";
import { ObjectLiteral, Repository } from "typeorm";
import { IDelegationRepository } from "../idelegation.repository";
import { BaseRepository } from "./base.repository";
import { Delegation } from "../../entities/delegation.entity";

@Injectable()
export class DelegationRepository extends BaseRepository<Delegation> implements IDelegationRepository {
    private readonly _logger = new Logger(DelegationRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.DELEGATION)
        private readonly repos: Repository<Delegation>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Delegation Repository ==============',
        );
    }
}