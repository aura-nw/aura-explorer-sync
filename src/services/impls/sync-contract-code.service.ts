import { Inject, Injectable, Logger } from "@nestjs/common";
import { REPOSITORY_INTERFACE } from "../../module.config";
import { CommonUtil } from "../../utils/common.util";
import { ConfigService } from "../../shared/services/config.service";
import { ISyncContractCodeService } from "../isync-contract-code.service";
import { ISmartContractCodeRepository } from "../../repositories/ismart-contract-code.repository";
import { Interval } from '@nestjs/schedule';
import { CONTRACT_CODE_RESULT, CONTRACT_CODE_STATUS } from "../../common/constants/app.constant";
import { SmartContractCode } from "../../entities/smart-contract-code.entity";

@Injectable()
export class SyncContractCodeService implements ISyncContractCodeService {
    private readonly _logger = new Logger(SyncContractCodeService.name);
    private indexerUrl;
    private isSyncContractCode = false;

    constructor(
        private configService: ConfigService,
        private _commonUtil: CommonUtil,
        @Inject(REPOSITORY_INTERFACE.ISMART_CONTRACT_CODE_REPOSITORY)
        private smartContractCodeRepository: ISmartContractCodeRepository
    ) {
        this._logger.log(
            '============== Constructor Sync Contract Code Service ==============',
        );
        this.indexerUrl = this.configService.get('INDEXER_URL');
    }

    @Interval(500)
    async handleInterval() {
        // check status
        if (this.isSyncContractCode) {
            this._logger.log(null, 'already syncing contract code... wait');
            return;
        } else {
            this._logger.log(null, 'fetching data contract code...');
        }
        try {
            //get contract code from db
            let contractCodeDB = await this.smartContractCodeRepository.findByCondition(
                { result: CONTRACT_CODE_RESULT.TBD }
            );
            this.isSyncContractCode = true;
            if (contractCodeDB && contractCodeDB.length > 0) {
                for (let i = 0; i < contractCodeDB.length; i++) {
                    let item: SmartContractCode = contractCodeDB[i];
                    //get contract code from indexer
                    const contractCodeIndexer = await this._commonUtil.getDataAPI(`${this.indexerUrl}api/v1/codeid/${item.code_id}/checkStatus`, '');
                    if (contractCodeIndexer.data.status === CONTRACT_CODE_STATUS.COMPLETED) {
                        item.result = CONTRACT_CODE_RESULT.CORRECT;
                    } else if (contractCodeIndexer.data.status === CONTRACT_CODE_STATUS.REJECTED) {
                        item.result = CONTRACT_CODE_RESULT.INCORRECT;
                    } else {
                        item.result = CONTRACT_CODE_RESULT.TBD;
                    }
                    // update data
                    await this.smartContractCodeRepository.upsert([item], []);
                }
            }
            this.isSyncContractCode = false;
        } catch (error) {
            this._logger.error(
                null,
                `Sync Contract Code was error, ${error.name}: ${error.message}`,
            );
            this._logger.error(null, `${error.stack}`);
            this.isSyncContractCode = false;
            throw error;
        }
    }
}