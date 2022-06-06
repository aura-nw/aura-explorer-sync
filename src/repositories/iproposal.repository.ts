import { IBaseRepository } from "./ibase.repository";

export interface IProposalRepository extends IBaseRepository {
    /**
     * Set proposals which ID don't exist in list to is_delete true
     * @param listId 
     */
    deleteProposals();
}