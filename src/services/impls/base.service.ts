import { IBaseService } from '../ibase.service';
import { ErrorMap } from '../../common/error.map';
import { ResponseDto } from '../../dtos/responses/response.dto';

export class BaseService<T> implements IBaseService<T> {
  private _repos: any;
  public constructor(repos: any) {
    this._repos = repos;
  }

  /**
   * findOne
   * @param condition
   * @returns
   */
  public async findOne(id: any): Promise<T> {
    return await this._repos.findOne(id);
  }

  /**
   * findByCondition
   * @param condition
   * @param orderBy
   * @returns
   */
  public async findByCondition (
    condition: any,
    orderBy: any = null,
  ): Promise<T[]>{
    return await this._repos.findByCondition(condition, orderBy);
  }

  /**
   * findWithRelations
   * @param relations
   * @returns
   */
  public async findWithRelations(relations: any): Promise<T[]> {
    return await this._repos.findWithRelations(relations);
  }

  /**
   * findAll
   * @param orderBy
   * @returns
   */
  public async findAll(orderBy?: any): Promise<T[]> {
    return await this._repos.findAll(orderBy);
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
  ): Promise<ResponseDto> {
    const result = await this._repos.findAndCount(
      pageIndex,
      pageSize,
      condition,
      orderBy,
    );
    return result;
  }

  /**
   * create
   * @param data
   * @returns
   */
  public async create(data: T | any): Promise<T> {
    return await this._repos.create(data);
  }

  /**
   * update
   * @param data
   * @returns
   */
  public async update(data: T | any): Promise<T> {
    return await this._repos.update(data);
  }

  /**
   * remove
   * @param id
   * @returns
   */
  public async remove(id: any): Promise<T> {
    return await this._repos.remove(id);
  }

  /**
   * upsert
   * @param data 
   * @param conflictPathsOrOptions 
   * @returns 
   */
  public upsert(data: Array<any>, conflictPathsOrOptions: string[]): Promise<T[]> {
    return this._repos.upsert(data, conflictPathsOrOptions);
  }
}
