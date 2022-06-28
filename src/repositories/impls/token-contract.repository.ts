import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { TokenContract } from "../../entities/token-contract.entity";
import { ENTITIES_CONFIG } from "src/module.config";
import { Repository } from "typeorm";
import { ITokenContractRepository } from "../itoken-contract.repository";
import { BaseRepository } from "./base.repository";

@Injectable()
export class TokenContractRepository extends BaseRepository<TokenContract> implements ITokenContractRepository {
    private readonly _logger = new Logger(TokenContractRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.TOKEN_CONTRACT)
        private readonly repos: Repository<TokenContract>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Token Contract Repository ==============',
        );
    }
}