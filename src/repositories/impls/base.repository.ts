import { DeleteResult, FindConditions, FindOneOptions, In, Repository } from 'typeorm';
import { IBaseRepository } from '../ibase.repository';
import { PaginatorResponse } from '../../dtos/responses/paginator.response';
import { Logger } from '@nestjs/common';

export class BaseRepository<T> implements IBaseRepository<T> {
  private _repos: Repository<any>;
  private _log = new Logger(BaseRepository.name);

  public constructor(repos) {
    this._repos = repos;
  }


  /**
   * findOne
   * @param condition
   * @returns
   */
  public findOne(id: any): Promise<T>;
  public findOne(conditions: FindConditions<T>): Promise<any>;
  public findOne(conditions?: FindConditions<T>, options?: FindOneOptions<any>): Promise<T> {
    return this._repos.findOne(conditions, options);
  }

  /**
   * findByCondition
   * @param condition
   * @param orderBy
   * @returns
   */
  public findByCondition(
    condition: any,
    orderBy?: any,
    select?: string[],
    take?: number,
  ): Promise<T[]> {
    this._log.log(
      `============== Call method findOne width parameters: condition:${this.convertObjectToJson(
        condition,
      )}, orderBy: ${this.convertObjectToJson(orderBy)} ==============`,
    );
    const opt = { where: condition };
    if (orderBy) opt['order'] = orderBy;
    if (select) opt['select'] = select;
    if (take) opt['take'] = take;

    return this._repos.find(opt);
  }

  /**
   * findWithRelations
   * @param relations
   * @returns
   */
  public findWithRelations(relations: any): Promise<T[]> {
    return this._repos.find(relations);
  }

  /**
   * findAll
   * @param orderBy
   * @returns
   */
  public findAll(orderBy?: any): Promise<T[]> {
    if (orderBy) {
      return this._repos.find({ order: orderBy });
    } else {
      return this._repos.find();
    }
  }

  /**
   * findAndCount
   * @param pageIndex
   * @param pageSize
   * @param condition
   * @param orderBy
   * @returns
   */
  public async findAndCount(
    pageIndex: number,
    pageSize: number,
    condition: any = null,
    orderBy: any = null,
  ): Promise<PaginatorResponse> {
    const opt = {};
    const paginatorResponse = new PaginatorResponse();

    if (condition) {
      opt['where'] = condition;
    }

    opt['take'] = pageSize;
    opt['skip'] = pageSize * pageIndex;

    if (orderBy) {
      opt['order'] = orderBy;
    }

    const [result, totalRecord] = await this._repos.findAndCount(opt);
    paginatorResponse.pageIndex = pageIndex;
    paginatorResponse.pageSize = pageSize;
    paginatorResponse.pageResults = result;
    paginatorResponse.totalRecord = totalRecord;

    return paginatorResponse;
  }

  /**
   * create
   * @param data
   * @returns
   */
  public create(data: T): Promise<T> {
    return this._repos.save(data);
  }

  /**
   * insert - fail if duplicate entity
   * @param data
   * @returns
   */
  public insert(data: T): Promise<any> {
    return this._repos.insert(data);
  }

  /**
   * update
   * @param data
   * @returns
   */
  public update(data: T): Promise<T> {
    return this._repos.save(data);
  }

  /**
   * remove
   * @param id
   * @returns
   */
  public remove(id: any): Promise<DeleteResult> {
    return this._repos.delete(id);
  }

  private convertObjectToJson(obj: any) {
    return JSON.stringify(obj);
  }

  /**
   * upsert
   * @param data 
   * @param conflictPathsOrOptions 
   */
  public upsert(data: Array<T>, conflictPathsOrOptions: string[]) {
    const results = this._repos.upsert(data, conflictPathsOrOptions).then(t => t.identifiers);

    return results;
  }
}