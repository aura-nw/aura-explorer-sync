import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('proposal_votes')
export class ProposalVote extends BaseEntityIncrementId {
    @Column()
    proposal_id: number;

    @Column()
    voter: string;

    @Column()
    tx_hash: string;

    @Column()
    option: string;
}

