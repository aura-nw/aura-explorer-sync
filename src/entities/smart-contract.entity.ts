import { Column, Entity, Unique } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('smart_contracts')
@Unique(['contract_address'])
export class SmartContract extends BaseEntityIncrementId {
  @Column({
    type: 'timestamp',
    name: 'verified_at',
  })
  verified_at: Date;

  @Column({ name: 'height' })
  height: number;

  @Column({ name: 'code_id' })
  code_id: number;

  @Column({ name: 'contract_name' })
  contract_name: string;

  @Column({ name: 'contract_address' })
  contract_address: string;

  @Column({ name: 'creator_address' })
  creator_address: string;

  @Column({ name: 'contract_hash' })
  contract_hash: string;

  @Column({ name: 'tx_hash' })
  tx_hash: string;

  @Column({ name: 'url' })
  url: string;

  @Column({
    name: 'instantiate_msg_schema',
    type: 'text',
  })
  instantiate_msg_schema: string;

  @Column({
    name: 'query_msg_schema',
    type: 'text',
  })
  query_msg_schema: string;

  @Column({
    name: 'execute_msg_schema',
    type: 'text',
  })
  execute_msg_schema: string;

  @Column({ name: 'contract_match' })
  contract_match: string;

  @Column({ name: 'contract_verification' })
  contract_verification: string;

  @Column({ name: 'compiler_version' })
  compiler_version: string;

  @Column({ name: 's3_location' })
  s3_location: string;

  @Column({ name: 'reference_code_id' })
  reference_code_id: number;

  @Column({ name: 'mainnet_upload_status' })
  mainnet_upload_status: string;

  @Column({ name: 'token_name' })
  token_name: string;

  @Column({ name: 'token_symbol' })
  token_symbol: string;

  @Column({ name: 'num_tokens' })
  num_tokens: number;

  @Column({
    name: 'project_name',
    nullable: true
  })
  project_name: string;

  @Column({
    name: 'project_description',
    nullable: true
  })
  project_description: string;

  @Column({
    name: 'official_project_website',
    type: 'text',
    nullable: true
  })
  official_project_website: string;

  @Column({
    name: 'official_project_email',
    nullable: true
  })
  official_project_email: string;

  @Column({
    name: 'whitepaper',
    nullable: true
  })
  whitepaper: string;

  @Column({
    name: 'github',
    nullable: true
  })
  github: string;

  @Column({
    name: 'telegram',
    nullable: true
  })
  telegram: string;

  @Column({
    name: 'wechat',
    nullable: true
  })
  wechat: string;

  @Column({
    name: 'linkedin',
    nullable: true
  })
  linkedin: string;

  @Column({
    name: 'discord',
    nullable: true
  })
  discord: string;

  @Column({
    name: 'medium',
    nullable: true
  })
  medium: string;

  @Column({
    name: 'reddit',
    nullable: true
  })
  reddit: string;

  @Column({
    name: 'slack',
    nullable: true
  })
  slack: string;

  @Column({
    name: 'facebook',
    nullable: true
  })
  facebook: string;

  @Column({
    name: 'twitter',
    nullable: true
  })
  twitter: string;

  @Column({
    name: 'bitcointalk',
    nullable: true
  })
  bitcointalk: string;
}
