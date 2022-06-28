import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ENTITIES_CONFIG } from "../../module.config";
import { ObjectLiteral, Repository } from "typeorm";
import { IHistoryProposalRepository } from "../ihistory-proposal.repository";
import { BaseRepository } from "./base.repository";
import { HistoryProposal } from "../../entities/history-proposal.entity";

@Injectable()
export class HistoryProposalRepository extends BaseRepository<HistoryProposal> implements IHistoryProposalRepository {
    private readonly _logger = new Logger(HistoryProposalRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.HISTORY_PROPOSAL)
        private readonly repos: Repository<HistoryProposal>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor History Proposal Repository ==============',
        );
    }
}