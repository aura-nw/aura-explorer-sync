import { Column, CreateDateColumn, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('proposal_deposits')
export class ProposalDeposit extends BaseEntityIncrementId {
    @Column()
    proposal_id: number;

    @Column()
    tx_hash: string;

    @Column()
    depositor: string;

    @Column()
    amount: number;
}