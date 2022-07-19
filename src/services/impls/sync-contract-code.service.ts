import { Inject, Injectable, Logger } from '@nestjs/common';
import { REPOSITORY_INTERFACE } from '../../module.config';
import { CommonUtil } from '../../utils/common.util';
import { ConfigService } from '../../shared/services/config.service';
import { ISyncContractCodeService } from '../isync-contract-code.service';
import { ISmartContractCodeRepository } from '../../repositories/ismart-contract-code.repository';
import { Interval } from '@nestjs/schedule';
import {
  CONTRACT_CODE_RESULT,
  CONTRACT_CODE_STATUS,
  INDEXER_API,
} from '../../common/constants/app.constant';
import { SmartContractCode } from '../../entities/smart-contract-code.entity';
import * as util from 'util';

@Injectable()
export class SyncContractCodeService implements ISyncContractCodeService {
  private readonly _logger = new Logger(SyncContractCodeService.name);
  private indexerUrl;
  private indexerChainId;
  private isSyncContractCode = false;

  constructor(
    private configService: ConfigService,
    private _commonUtil: CommonUtil,
    @Inject(REPOSITORY_INTERFACE.ISMART_CONTRACT_CODE_REPOSITORY)
    private smartContractCodeRepository: ISmartContractCodeRepository,
  ) {
    this._logger.log(
      '============== Constructor Sync Contract Code Service ==============',
    );
    this.indexerUrl = this.configService.get('INDEXER_URL');
    this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');
  }

  @Interval(2000)
  async handleInterval() {
    // check status
    if (this.isSyncContractCode) {
      this._logger.log(null, 'already syncing contract code... wait');
      return;
    } else {
      this._logger.log(null, 'fetching data contract code...');
    }
    try {
      this.isSyncContractCode = true;
      //get contract code from db
      const contractCodeDB =
        await this.smartContractCodeRepository.findByCondition({
          result: CONTRACT_CODE_RESULT.TBD,
        });
      if (contractCodeDB && contractCodeDB.length > 0) {
        const contractCodes = [];
        for (let i = 0; i < contractCodeDB.length; i++) {
          const item: SmartContractCode = contractCodeDB[i];
          //get contract code from indexer
          const contractCodeIndexer = await this._commonUtil.getDataAPI(
            `${this.indexerUrl}${util.format(
              INDEXER_API.CHECK_STATUS_CODE_ID,
              this.indexerChainId,
              item.code_id,
            )}`,
            '',
          );
          switch (contractCodeIndexer.data.status) {
            case CONTRACT_CODE_STATUS.COMPLETED:
              item.result = CONTRACT_CODE_RESULT.CORRECT;
              break;
            case CONTRACT_CODE_STATUS.REJECTED:
              item.result = CONTRACT_CODE_RESULT.INCORRECT;
              break;
            default:
              item.result = CONTRACT_CODE_RESULT.TBD;
          }
          contractCodes.push(item);
        }
        // update data
        await this.smartContractCodeRepository.update(contractCodes);
      }
      this.isSyncContractCode = false;
    } catch (error) {
      this._logger.error(
        `Sync Contract Code was error, ${error.name}: ${error.message}`,
      );
      this._logger.error(`${error.stack}`);
      this.isSyncContractCode = false;
      throw error;
    }
  }
}
