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
            ])
        let res = await query.getRawMany();
        return res;
    }
}