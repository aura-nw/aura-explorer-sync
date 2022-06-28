import { Proposal } from "../entities/proposal.entity";
import { IBaseRepository } from "./ibase.repository";

export interface IProposalRepository extends IBaseRepository<Proposal> {
    /**
     * Set proposals which ID don't exist in list to is_delete true
     * @param listId 
     */
    deleteProposals();
}