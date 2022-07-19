import { PaginatorResponse } from '../dtos/responses/paginator.response';
import { DeleteResult } from 'typeorm';

export interface IBaseRepository {

  find(options: any): Promise<any>;
  /**
   * findOne
   * @param id
   */
  findOne(id?: any): Promise<any>;

  /**
   * findByCondition
   * @param filterCondition
   * @param orderBy
   */
  findByCondition(
    filterCondition: any,
    orderBy?: any,
    select?: string[],
  ): Promise<any[]>;

  /**
   * findAll
   * @param orderBy
   */
  findAll(orderBy?: any): Promise<any[]>;

  /**
   * findWithRelations
   * @param relations
   */
  findWithRelations(relations: any): Promise<any[]>;

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
  create(data: any): Promise<any>;

  /**
   * insert
   * @param data
   */
  insert(data: any): Promise<any>;

  /**
   * update
   * @param data
   */
  update(data: any): Promise<any>;

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
  upsert(data: Array<any>, conflictPathsOrOptions: string[]);

  /**
  * Get max by column of table
  * @param column 
  */
  max(column: string): Promise<any>;
}
