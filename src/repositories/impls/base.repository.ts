import { DeleteResult, In, Repository } from 'typeorm';
import { IBaseRepository } from '../ibase.repository';
import { PaginatorResponse } from '../../dtos/responses/paginator.response';
import { Logger } from '@nestjs/common';

export class BaseRepository implements IBaseRepository {
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
  public async findOne(id?: any): Promise<any> {
    if (id) {
      this._log.log(
        `============== Call method findOne width parameters:${id} ==============`,
      );
      return this._repos.findOne(id);
    } else {
      this._log.log(
        `============== Call method findOne without parameters ==============`,
      );
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
  ): Promise<any[]> {
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
  public async findWithRelations(relations: any): Promise<any[]> {
    return this._repos.find(relations);
  }

  /**
   * findAll
   * @param orderBy
   * @returns
   */
  public async findAll(orderBy?: any): Promise<any[]> {
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

  private convertObjectToJson(obj: any) {
    return JSON.stringify(obj);
  }

  /**
   * insertOrIgnore
   * @param data 
   * @param conflictCols 
   * @param primaryKey 
   * @returns 
   */
  public async insertOrIgnore(data: Array<any>, conflictCols: string[], primaryKey: string) {
    const selectColums = [...conflictCols, primaryKey];
    let queryBuilder = this._repos.createQueryBuilder()
      .select(selectColums);

    const paras = [];

    // Create conditions to search data
    let isMany = false;
    conflictCols.forEach(key => {
      const conflicValues = [];

      data.forEach(item => {
        conflicValues.push(item[key]);
      });

      if (conflicValues.length > 0) {
        paras.push(conflicValues);

        if (isMany) {
          queryBuilder.andWhere({ [key]: In(conflicValues) });
        } else {
          queryBuilder.where({ [key]: In(conflicValues) });
        }
        isMany = true;
      }
    });

    //Find data have columns conflict
    const sqlQuery = queryBuilder.getSql();

    // Find block
    const findResults = await this._repos.query(sqlQuery, paras);

    // Chek columns conflict hava match with results
    findResults.forEach(item => {
      let isExit = true;
      conflictCols.forEach(col => {
        const compare = data.find(f => f[col] !== item[col]);
        if (compare) {
          isExit = false;
        }
      });

      // Check data have exits or not
      if (isExit) {
        const dataSetPK = data.find(f => f[primaryKey] !== item[primaryKey]);
        if (dataSetPK) {
          dataSetPK[primaryKey] = item[primaryKey];
        }
      }
    });

    // Execute block data
    const results = await this._repos.createQueryBuilder()
      .insert()
      .values(data)
      .orIgnore()
      .execute().then(t => t.identifiers);

    return results;
  }
}