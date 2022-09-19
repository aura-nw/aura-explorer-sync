import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CONTRACT_CODE_RESULT, CONTRACT_TYPE, MESSAGE_ACTION, SMART_CONTRACT_VERIFICATION } from '../common/constants/app.constant';
import { SmartContract } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class SmartContractRepository extends BaseRepository<SmartContract> {
  private readonly _logger = new Logger(SmartContractRepository.name);
  constructor(
    @InjectRepository(SmartContract)
    private readonly repos: Repository<SmartContract>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Smart Contract Repository ==============',
    );
  }

  async getLatestBlockHeight() {
    const query = this.repos
      .createQueryBuilder('smart_contracts')
      .select('smart_contracts.height as height')
      .orderBy('smart_contracts.id', 'DESC');
    const res = await query.getRawOne();
    if (res) {
      return res.height;
    }
    return 0;
  }

  async findExactContractByHash(contract_hash: string) {
    const query = this.repos
      .createQueryBuilder('smart_contracts')
      .where('smart_contracts.contract_hash = :contract_hash', {
        contract_hash,
      })
      .andWhere('smart_contracts.contract_verification = :contract_verification', {
        contract_verification: SMART_CONTRACT_VERIFICATION.EXACT_MATCH,
      })
      .select([
        'smart_contracts.contract_address as contract_address',
        'smart_contracts.url as url',
        'smart_contracts.contract_verification as contract_verification',
        'smart_contracts.compiler_version as compiler_version',
        'smart_contracts.instantiate_msg_schema as instantiate_msg_schema',
        'smart_contracts.query_msg_schema as query_msg_schema',
        'smart_contracts.execute_msg_schema as execute_msg_schema',
        'smart_contracts.s3_location as s3_location',
      ]);
    const res = await query.getRawOne();
    return res;
  }

  async getTokensRegisteredType() {
    const sql = `SELECT sc.contract_address
      FROM smart_contracts sc
        INNER JOIN smart_contract_codes scc ON sc.code_id = scc.code_id AND scc.result = '${CONTRACT_CODE_RESULT.CORRECT}' AND scc.type = '${CONTRACT_TYPE.CW721}'`;

    return await this.repos.query(sql, []);
  }
}
