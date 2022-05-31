import { Column, CreateDateColumn, Entity, Unique } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('history_proposals')
export class HistoryProposal extends BaseEntityIncrementId {
    @Column({ name: 'proposal_id' })
    proposal_id: number;

    @Unique(['tx_hash'])
    @Column({ name: 'tx_hash', update: false })
    tx_hash: string;

    @Column({ name: 'title' })
    title: string;

    @Column({ name: 'description' })
    description: string;

    @Column({ name: 'recipient' })
    recipient: string;

    @Column({ name: 'amount' })
    amount: number;

    @Column({ name: 'initial_deposit' })
    initial_deposit: number;

    @Column({ name: 'proposer' })
    proposer: string;
}

