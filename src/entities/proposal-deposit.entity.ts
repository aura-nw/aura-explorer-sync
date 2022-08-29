import { Column, CreateDateColumn, Entity, Unique } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('proposal_deposits')
@Unique(['tx_hash'])
export class ProposalDeposit extends BaseEntityIncrementId {
  @Column({ name: 'proposal_id' })
  proposal_id: number;

  @Column({ name: 'tx_hash' })
  tx_hash: string;

  @Column({ name: 'depositor', update: false })
  depositor: string;

  @Column({ name: 'amount' })
  amount: number;
}
