import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ENTITIES_CONFIG } from "src/module.config";
import { ObjectLiteral, Repository } from "typeorm";
import { ISmartContractRepository } from "../ismart-contract.repository";
import { BaseRepository } from "./base.repository";

@Injectable()
export class SmartContractRepository extends BaseRepository implements ISmartContractRepository {
    private readonly _logger = new Logger(SmartContractRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.SMART_CONTRACT)
        private readonly repos: Repository<ObjectLiteral>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Smart Contract Repository ==============',
        );
    }
}