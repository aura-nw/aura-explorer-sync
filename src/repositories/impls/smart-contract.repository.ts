import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { SmartContract } from "../../entities/smart-contract.entity";
import { ENTITIES_CONFIG } from "src/module.config";
import { ObjectLiteral, Repository } from "typeorm";
import { ISmartContractRepository } from "../ismart-contract.repository";
import { BaseRepository } from "./base.repository";

@Injectable()
export class SmartContractRepository extends BaseRepository<SmartContract> implements ISmartContractRepository {
    private readonly _logger = new Logger(SmartContractRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.SMART_CONTRACT)
        private readonly repos: Repository<SmartContract>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Smart Contract Repository ==============',
        );
    }

    async getLatestBlockHeight() {
        let query = this.repos
            .createQueryBuilder('smart_contracts')
            .select('smart_contracts.height as height')
            .orderBy('smart_contracts.id', 'DESC');
        let res = await query.getRawOne();
        if (res) {
            return res.height;
        }
        return 0;
    }

    async findContractByHash(contract_hash: string) {
        let query = this.repos
            .createQueryBuilder('smart_contracts')
            .where('smart_contracts.contract_hash = :contract_hash', { contract_hash })
            .select([
                'smart_contracts.contract_address as contract_address',
                'smart_contracts.url as url',
                'smart_contracts.contract_verification as contract_verification',
                'smart_contracts.compiler_version as compiler_version',
                'smart_contracts.instantiate_msg_schema as instantiate_msg_schema',
                'smart_contracts.query_msg_schema as query_msg_schema',
                'smart_contracts.execute_msg_schema as execute_msg_schema',
            ])
        let res = await query.getRawMany();
        return res;
    }
}