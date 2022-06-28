import { SmartContract } from "../entities/smart-contract.entity";
import { IBaseRepository } from "./ibase.repository";

export interface ISmartContractRepository extends IBaseRepository<SmartContract> {
  /**
 * Get the latest block height in DB
 */
  getLatestBlockHeight();

  /**
   * Find smart contract by contract hash
   * @param contract_hash 
   */
  findContractByHash(contract_hash: string);
}