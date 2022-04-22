import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ENTITIES_CONFIG } from "src/module.config";
import { ObjectLiteral, Repository } from "typeorm";
import { IDelegatorRewardRepository } from "../idelegator-reward.repository";
import { IProposalDepositRepository } from "../iproposal-deposit.repository";
import { BaseRepository } from "./base.repository";

export class ProposalDepositRepository extends BaseRepository implements IProposalDepositRepository {
    private readonly _logger = new Logger(ProposalDepositRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.PROPOSAL_DEPOSIT)
        private readonly repos: Repository<ObjectLiteral>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Proposal Deposit Repository ==============',
        );
    }
}