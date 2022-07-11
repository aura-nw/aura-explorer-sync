import { ResponseDto } from '../dtos/responses/response.dto';

export interface IBaseService {
  /**
   * Get firts data
   * @param id
   */
  findOne(id: any): Promise<ResponseDto>;

  /**
   * Get data by condition
   * @param filterCondition
   * @param orderBy
   */
  findByCondition(filterCondition: any, orderBy: any): Promise<ResponseDto>;

  /**
   * Get data has relations
   * @param orderBy
   */
  findAll(orderBy?: any): Promise<ResponseDto>;

  /**
   * Get all data
   * @param relations
   */
  findWithRelations(relations: any): Promise<ResponseDto>;

  /**
   * Get data paging
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
  ): Promise<ResponseDto>;

  /**
   * Create new data
   * @param data
   */
  create<T>(data: T | any): Promise<ResponseDto>;

  /**
   * Update data
   * @param data
   */
  update<T>(data: T | any): Promise<ResponseDto>;

  /**
   * Remove data by id
   * @param id
   */
  remove(id: any): Promise<ResponseDto>;

  /**
   * Insert/Update data
   * @param data
   * @param conflictPathsOrOptions
   */
  upsert(data: Array<any>, conflictPathsOrOptions: string[]): Promise<any>;
}
