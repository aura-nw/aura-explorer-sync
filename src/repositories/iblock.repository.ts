import { IBaseRepository } from './ibase.repository';

export interface IBlockRepository extends IBaseRepository {
    getBlockByRange(start: number, end: number);
}
