import { Logger } from '@nestjs/common';
import { DeleteResult, Repository } from 'typeorm';
import { PaginatorResponse } from '../dtos/responses/paginator.response';

export class BaseRepository<T> {
  private _repos: Repository<T>;
  private _log = new Logger(BaseRepository.name);

  public constructor(repos: Repository<T>) {
    this._repos = repos;
  }

  public find(options: any): Promise<T[]> {
    return this._repos.find(options);
  }

  /**
   * findOne
   * @param condition
   * @returns
   */
  public async findOne(id?: any): Promise<T> {
    if (id) {
      return this._repos.findOne(id);
    } else {
      return this._repos.findOne();
    }
  }

  /**
   * findByCondition
   * @param condition
   * @param orderBy
   * @returns
   */
  public async findByCondition(
    condition: any,
    orderBy?: any,
    select?: string[],
    take?: number,
  ): Promise<T[]> {
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
  public async findWithRelations(relations: any): Promise<any[]> {
    return this._repos.find(relations);
  }

  /**
   * findAll
   * @param orderBy
   * @returns
   */
  public async findAll(orderBy?: any): Promise<T[]> {
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
  public async create(data: any): Promise<any> {
    return this._repos.save(data);
  }

  /**
   * insert - fail if duplicate entity
   * @param data
   * @returns
   */
  public async insert(data: any): Promise<any> {
    return this._repos.insert(data);
  }

  /**
   * update
   * @param data
   * @returns
   */
  public async update(data: any): Promise<any> {
    return this._repos.save(data);
  }

  /**
   * remove
   * @param id
   * @returns
   */
  public async remove(id: any): Promise<DeleteResult> {
    return this._repos.delete(id);
  }

  /**
   * upsert
   * @param data
   * @param conflictPathsOrOptions
   */
  public async upsert(data: Array<any>, conflictPathsOrOptions: string[]) {
    const results = await this._repos
      .upsert(data, conflictPathsOrOptions)
      .then((t) => t.identifiers);

    return results;
  }

  /**
  * Get max by column of table
  * @param column 
  */
  max(column: string): Promise<any> {
    return this._repos.createQueryBuilder()
      .select(`max(${column}) as ${column}`)
      .getRawOne();
  }
}
