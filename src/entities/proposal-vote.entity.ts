import { Column, Entity, Unique } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('proposal_votes')
@Unique(['proposal_id', 'voter'])
export class ProposalVote extends BaseEntityIncrementId {
  @Column({ name: 'proposal_id', update: false })
  proposal_id: number;

  @Column({ name: 'voter', update: false })
  voter: string;

  @Column({ name: 'tx_hash' })
  tx_hash: string;

  @Column({ name: 'option' })
  option: string;
}
