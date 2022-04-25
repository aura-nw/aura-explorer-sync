import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('proposal_votes')
export class ProposalVote extends BaseEntityIncrementId {
    @Column({ name: 'proposal_id' })
    proposal_id: number;

    @Column({ name: 'voter' })
    voter: string;

    @Column({ name: 'tx_hash' })
    tx_hash: string;

    @Column({ name: 'option' })
    option: string;
}

