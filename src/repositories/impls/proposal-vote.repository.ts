import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ENTITIES_CONFIG } from "src/module.config";
import { ObjectLiteral, Repository } from "typeorm";
import { IDelegatorRewardRepository } from "../idelegator-reward.repository";
import { IProposalVoteRepository } from "../iproposal-vote.repository";
import { BaseRepository } from "./base.repository";

@Injectable()
export class ProposalVoteRepository extends BaseRepository implements IProposalVoteRepository {
    private readonly _logger = new Logger(ProposalVoteRepository.name);
    constructor(
        @InjectRepository(ENTITIES_CONFIG.PROPOSAL_VOTE)
        private readonly repos: Repository<ObjectLiteral>,
    ) {
        super(repos);
        this._logger.log(
            '============== Constructor Proposal Vote Repository ==============',
        );
    }
}