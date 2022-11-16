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
    nullable: true,
  })
  project_name: string;

  @Column({
    name: 'request_id',
    nullable: true,
  })
  request_id: number;

  @Column({ name: 'coin_id' })
  coin_id: string;

  @Column({ name: 'image' })
  image: string;

  @Column({ name: 'description' })
  description: string;
}
