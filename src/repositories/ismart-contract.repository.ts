import { IBaseRepository } from "./ibase.repository";

export interface ISmartContractRepository extends IBaseRepository {
    /**
   * Get the latest block height in DB
   */
  getLatestBlockHeight();
}