import { PaginatorResponse } from '../dtos/responses/paginator.response';
import { DeleteResult, FindConditions, FindOneOptions } from 'typeorm';

export interface IBaseRepository<T> {
  /**
   * findOne
   * @param id
   */
  findOne(id?: any): Promise<T>;

  /**
   * findOne
   * @param options 
   */
  findOne(options?: FindOneOptions<any>): Promise<T>;

  /**
   * findOne
   * @param conditions 
   * @param options 
   */
  findOne(conditions?: FindConditions<T>, options?: FindOneOptions<any>): Promise<T>

  /**
   * findByCondition
   * @param filterCondition
   * @param orderBy
   */
  findByCondition(
    filterCondition: any,
    orderBy?: any,
    select?: string[],
  ): Promise<T[]>;

  /**
   * findAll
   * @param orderBy
   */
  findAll(orderBy?: any): Promise<T[]>;

  /**
   * findWithRelations
   * @param relations
   */
  findWithRelations(relations: any): Promise<T[]>;

  /**
   * findAndCount
   * @param pageIndex
   * @param pageSize
   * @param condition
   * @param orderBy
   */
  findAndCount(
    pageIndex: number,
    pageSize: number,
    condition: any,
    orderBy: any,
  ): Promise<PaginatorResponse>;

  /**
   * create
   * @param data
   */
  create(data: any): Promise<T>;

  /**
   * insert
   * @param data
   */
  insert(data: any): Promise<any>;

  /**
   * update
   * @param data
   */
  update(data: any): Promise<T>;

  /**
   * remove
   * @param id
   */
  remove(id: any): Promise<DeleteResult>;

  /**
   * upsert
   * @param data 
   * @param conflictPathsOrOptions 
   */
  upsert(data: Array<T>, conflictPathsOrOptions: string[]);
}
