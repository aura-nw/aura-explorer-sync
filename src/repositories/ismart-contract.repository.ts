import { IBaseRepository } from './ibase.repository';

export interface ISmartContractRepository extends IBaseRepository {
  /**
   * Get the latest block height in DB
   */
  getLatestBlockHeight();

  /**
   * Find smart contract by contract hash
   * @param contract_hash
   */
  findExactContractByHash(contract_hash: string);
}
