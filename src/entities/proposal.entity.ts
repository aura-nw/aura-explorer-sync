import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('proposals')
export class Proposal {
  @PrimaryGeneratedColumn('increment', { name: 'pro_id' })
  pro_id: number;

  @Column({ name: 'pro_tx_hash' })
  pro_tx_hash: string;

  @Column({ name: 'pro_proposer' })
  pro_proposer: string;

  @Column({ name: 'pro_proposer_address' })
  pro_proposer_address: string;

  @Column({ name: 'pro_type' })
  pro_type: string;

  @Column({ name: 'pro_title' })
  pro_title: string;

  @Column({ name: 'pro_description' })
  pro_description: string;

  @Column({
    default: null,
    name: 'pro_status',
  })
  pro_status: string;

  @Column({
    default: 0.0,
    name: 'pro_votes_yes',
  })
  pro_votes_yes: number;

  @Column({
    default: 0.0,
    name: 'pro_votes_abstain',
  })
  pro_votes_abstain: number;

  @Column({
    default: 0.0,
    name: 'pro_votes_no',
  })
  pro_votes_no: number;

  @Column({ name: 'pro_votes_no_with_veto' })
  pro_votes_no_with_veto: number;

  @Column({ name: 'pro_submit_time' })
  pro_submit_time: Date;

  @Column({ name: 'pro_deposit_end_time' })
  pro_deposit_end_time: Date;

  @Column({
    default: 0.0,
    name: 'pro_total_deposits',
  })
  pro_total_deposits: number;

  @Column({
    default: '2000-01-01 00:00:00',
    name: 'pro_voting_start_time',
  })
  pro_voting_start_time: Date;

  @Column({
    default: '2000-01-01 00:00:00',
    name: 'pro_voting_end_time',
  })
  pro_voting_end_time: Date;

  @Column({
    default: 0,
    name: 'pro_voters',
  })
  pro_voters: number;

  @Column({
    default: 0.0,
    name: 'pro_participation_rate',
  })
  pro_participation_rate: number;

  @Column({
    default: 0.0,
    name: 'pro_turnout',
  })
  pro_turnout: number;

  @Column({
    type: 'json',
    name: 'pro_activity',
  })
  pro_activity: any;

  @Column({
    default: false,
    name: 'is_delete',
  })
  is_delete: boolean;
}
