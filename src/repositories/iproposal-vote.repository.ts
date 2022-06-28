import { ProposalVote } from "../entities/proposal-vote.entity";
import { IBaseRepository } from "./ibase.repository";

export interface IProposalVoteRepository extends IBaseRepository<ProposalVote> {}