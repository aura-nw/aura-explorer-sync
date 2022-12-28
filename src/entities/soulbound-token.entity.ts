import { Column, Entity, Index } from 'typeorm';
import { SOULBOUND_TOKEN_STATUS } from '../common/constants/app.constant';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('soulbound_token')
export class SoulboundToken extends BaseEntityIncrementId {
  @Column({ name: 'contract_address' })
  @Index({ unique: false })
  contract_address: string;

  @Column({ name: 'token_id' })
  @Index({ unique: true })
  token_id: string;

  @Column({ name: 'token_uri' })
  token_uri: string;

  @Column({ name: 'token_img' })
  token_img: string;

  @Column({ name: 'receiver_address' })
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

  @Column({ name: 'pub_key', nullable: true, type: 'text' })
  pub_key: string;

  @Column({ default: false })
  picked: boolean;
}
