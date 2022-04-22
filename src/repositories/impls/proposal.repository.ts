import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ENTITIES_CONFIG } from "src/module.config";
import { ObjectLiteral, Repository } from "typeorm";
import { IProposalRepository } from "../iproposal.repository";
import { BaseRepository } from "./base.repository";

export class ProposalRepository extends BaseRepository implements IProposalRepository {
    private readonly _logger = new Logger(ProposalRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.PROPOSAL)
        private readonly repos: Repository<ObjectLiteral>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Proposal Repository ==============',
        );
    }

    async deleteProposalsByListId(listId: []) {
        const sql = `UPDATE proposals SET is_delete = 1 WHERE pro_id NOT IN (?)`;
        return await this.repos.query(sql, [listId]);
    }
}