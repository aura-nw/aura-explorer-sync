import { Column, CreateDateColumn, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('history_proposals')
export class HistoryProposal extends BaseEntityIncrementId {
    @Column()
    proposal_id: number;

    @Column()
    tx_hash: string;

    @Column()
    title: string;

    @Column()
    description: string;

    @Column()
    recipient: string;

    @Column()
    amount: number;

    @Column()
    initial_deposit: number;

    @Column()
    proposer: string;
}

