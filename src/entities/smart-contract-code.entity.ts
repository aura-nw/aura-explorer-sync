import { CONTRACT_TYPE } from '../common/constants/app.constant';
import { Column, Entity } from 'typeorm';
import { BaseEntityIncrementId } from './base/base.entity';

@Entity('smart_contract_codes')
export class SmartContractCode extends BaseEntityIncrementId {
  @Column({ name: 'code_id' })
  code_id: number;

  @Column({ name: 'type' })
  type: string;

  @Column({ name: 'result' })
  result: string;

  @Column({ name: 'creator' })
  creator: string;

  @Column({ name: 'tx_hash' })
  tx_hash: string;

  @Column({ name: 'instantiate_msg_schema', type: 'text' })
  instantiate_msg_schema: string;

  @Column({ name: 'query_msg_schema', type: 'text' })
  query_msg_schema: string;

  @Column({ name: 'execute_msg_schema', type: 'text' })
  execute_msg_schema: string;

  @Column({ name: 'contract_hash' })
  contract_hash: string;

  @Column({ name: 's3_location' })
  s3_location: string;

  @Column({
    name: 'contract_verification',
  })
  contract_verification: string;

  @Column({ name: 'compiler_version' })
  compiler_version: string;

  @Column({ name: 'url' })
  url: string;

  @Column({
    type: 'timestamp',
    name: 'verified_at',
  })
  verified_at: Date;
}
