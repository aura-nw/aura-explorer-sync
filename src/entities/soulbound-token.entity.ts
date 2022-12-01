import { Column, Entity, Index } from 'typeorm';
import { SOULBOUND_TOKEN_STATUS } from '../common/constants/app.constant';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('soulbound_token')
export class SoulboundToken extends BaseEntityIncrementId {
  @Column()
  @Index({ unique: false })
  contract_address: string;

  @Column()
  @Index({ unique: true })
  token_id: string;

  @Column()
  token_uri: string;

  @Column()
  @Index({ unique: false })
  receiver_address: string;

  @Column({
    type: 'enum',
    enum: SOULBOUND_TOKEN_STATUS,
    default: SOULBOUND_TOKEN_STATUS.UNCLAIM,
  })
  status: SOULBOUND_TOKEN_STATUS;

  @Column({ nullable: true, type: 'text' })
  signature: string;

  @Column({ default: false })
  picked: boolean;
}
