import { Transaction } from "../entities/transaction.entity";
import { IBaseRepository } from "./ibase.repository";

export interface ITransactionRepository extends IBaseRepository<Transaction> {}