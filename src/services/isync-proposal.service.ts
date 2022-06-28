import { Proposal } from "src/entities";
import { IBaseService } from "./ibase.service";

export interface ISyncProposalService {
    syncProposals(proposals: Array<any>);
}