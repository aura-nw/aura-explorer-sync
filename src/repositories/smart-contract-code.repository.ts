import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SMART_CONTRACT_VERIFICATION } from '../common/constants/app.constant';
import { SmartContractCode } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class SmartContractCodeRepository extends BaseRepository<SmartContractCode> {
  private readonly _logger = new Logger(SmartContractCodeRepository.name);
  constructor(
    @InjectRepository(SmartContractCode)
    private readonly repos: Repository<SmartContractCode>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Smart Contract Code Repository ==============',
    );
  }

  async findExactContractByHash(contract_hash: string) {
    const query = this.repos
      .createQueryBuilder('smart_contract_codes')
      .where('smart_contract_codes.contract_hash = :contract_hash', {
        contract_hash,
      })
      .andWhere(
        'smart_contract_codes.contract_verification = :contract_verification',
        {
          contract_verification: SMART_CONTRACT_VERIFICATION.VERIFIED,
        },
      )
      .select([
        'smart_contract_codes.code_id as code_id',
        'smart_contract_codes.url as url',
        'smart_contract_codes.contract_verification as contract_verification',
        'smart_contract_codes.compiler_version as compiler_version',
        'smart_contract_codes.instantiate_msg_schema as instantiate_msg_schema',
        'smart_contract_codes.query_msg_schema as query_msg_schema',
        'smart_contract_codes.execute_msg_schema as execute_msg_schema',
        'smart_contract_codes.s3_location as s3_location',
      ]);
    const res = await query.getRawOne();
    return res;
  }
}
