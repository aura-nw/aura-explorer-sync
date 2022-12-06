import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import * as util from 'util';
import {
  CONTRACT_CODE_RESULT,
  CONTRACT_CODE_STATUS,
  CONTRACT_TYPE,
  INDEXER_API,
} from '../common/constants/app.constant';
import { SmartContractCodeRepository } from '../repositories/smart-contract-code.repository';
import { ConfigService, ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { SmartContract, SmartContractCode } from '../entities';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';

@Injectable()
export class SyncContractCodeService {
  private readonly _logger = new Logger(SyncContractCodeService.name);
  private indexerUrl;
  private indexerChainId;
  private isSyncContractCode = false;
  private api;

  constructor(
    private configService: ConfigService,
    private _commonUtil: CommonUtil,
    private smartContractCodeRepository: SmartContractCodeRepository,
    private smartContractRepository: SmartContractRepository,
  ) {
    this._logger.log(
      '============== Constructor Sync Contract Code Service ==============',
    );
    this.indexerUrl = this.configService.get('INDEXER_URL');
    this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');
    this.api = ENV_CONFIG.NODE.API;
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
              //get contracts with code id
              const contractTypes: string[] = [
                CONTRACT_TYPE.CW721,
                CONTRACT_TYPE.CW20,
              ];
              if (contractTypes.includes(item.type)) {
                const contractDB =
                  await this.smartContractRepository.findByCondition({
                    code_id: item.code_id,
                  });
                if (contractDB && contractDB.length > 0) {
                  const contracts = [];
                  for (let i = 0; i < contractDB.length; i++) {
                    let contract: SmartContract = contractDB[i];

                    contract = await this._commonUtil.queryMoreInfoFromCosmwasm(
                      this.api,
                      contract.contract_address,
                      contract,
                      CONTRACT_TYPE[item.type],
                    );

                    contracts.push(contract);
                  }
                  await this.smartContractRepository.update(contracts);
                }
              }
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
