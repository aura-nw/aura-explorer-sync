import { ResponseDto } from "../dtos/responses/response.dto";

export interface IBaseService<T> {
  /**
   * findOne
   * @param id
   */
  findOne(id: any): Promise<T>;

  /**
   * findByCondition
   * @param filterCondition
   * @param orderBy
   */
  findByCondition(filterCondition: any, orderBy: any): Promise<T[]>;

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
  ): Promise<any>;

  /**
   * create
   * @param data
   */
  create(data: T | any): Promise<T>;

  /**
   * update
   * @param data
   */
  update(data: T | any): Promise<T>;

  /**
   * remove
   * @param id
   */
  remove(id: any): Promise<T>;

  /**
   * upsert
   * @param data 
   * @param conflictPathsOrOptions 
   */
  upsert(data: Array<any>, conflictPathsOrOptions: string[]): Promise<T[]>;
}
