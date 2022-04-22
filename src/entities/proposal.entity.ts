import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('proposals')
export class Proposal {
    @PrimaryGeneratedColumn('increment')
    pro_id: number;

    @Column()
    pro_tx_hash: string;

    @Column()
    pro_proposer: string;

    @Column()
    pro_proposer_address: string;

    @Column()
    pro_type: string;

    @Column()
    pro_title: string;

    @Column()
    pro_description: string;

    @Column({ default: null })
    pro_status: string;

    @Column({ default: 0.00000000 })
    pro_votes_yes: number;

    @Column({ default: 0.00000000 })
    pro_votes_abstain: number;

    @Column({ default: 0.00000000 })
    pro_votes_no: number;

    @Column()
    pro_votes_no_with_veto: number;

    @Column()
    pro_submit_time: Date;

    @Column()
    pro_deposit_end_time: Date;

    @Column({ default: 0.00000000 })
    pro_total_deposits: number;

    @Column({ default: '2000-01-01 00:00:00' })
    pro_voting_start_time: Date;

    @Column({ default: '2000-01-01 00:00:00' })
    pro_voting_end_time: Date;

    @Column({ default: 0 })
    pro_voters: number;

    @Column({ default: 0.00 })
    pro_participation_rate: number;

    @Column({ default: 0.00000000 })
    pro_turnout: number;

    @Column({ type: 'json' })
    pro_activity: any;

    @Column({ default: false })
    is_delete: boolean;
}