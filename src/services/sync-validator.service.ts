import { Injectable, Logger } from '@nestjs/common';
import { ValidatorRepository } from '../repositories/validator.repository';
import { bech32 } from 'bech32';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { CommonUtil } from '../utils/common.util';
import {
  CONST_CHAR,
  CONST_PUBKEY_ADDR,
  NODE_API,
  QUEUES,
} from '../common/constants/app.constant';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { ENV_CONFIG } from '../shared/services/config.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class SyncValidatorService {
  private readonly _logger = new Logger(SyncValidatorService.name);
  private isSyncValidator = false;
  private api = '';

  constructor(
    private validatorRepository: ValidatorRepository,
    private _commonUtil: CommonUtil,
    @InjectQueue('validator') private readonly validatorQueue: Queue,
  ) {
    this.api = ENV_CONFIG.NODE.API;

    // Sync Image Validator when app start
    (async () => {
      await this.syncValidatorImage();
    })();
  }

  @Interval(10000)
  async syncValidator() {
    try {
      // check status
      if (this.isSyncValidator) {
        this._logger.log('Already syncing validator... wait');
        return;
      } else {
        this._logger.log('Fetching data validator...');
      }

      const validators = [];

      // get validators
      const paramsValidator = NODE_API.VALIDATOR;
      // get staking pool
      const paramspool = NODE_API.STAKING_POOL;
      // get slashing param
      const paramsSlashing = NODE_API.SLASHING_PARAM;
      // get slashing signing info
      const paramsSigning = NODE_API.SIGNING_INFOS;

      const [validatorData, poolData, slashingData, signingData] =
        await Promise.all([
          this._commonUtil.getDataAPI(this.api, paramsValidator),
          this._commonUtil.getDataAPI(this.api, paramspool),
          this._commonUtil.getDataAPI(this.api, paramsSlashing),
          this._commonUtil.getDataAPI(this.api, paramsSigning),
        ]);

      if (validatorData) {
        this.isSyncValidator = true;
        for (const key in validatorData.validators) {
          const data = validatorData.validators[key];
          // get account address
          const operator_address = data.operator_address;
          const decodeAcc = bech32.decode(operator_address, 1023);
          const wordsByte = bech32.fromWords(decodeAcc.words);
          const account_address = bech32.encode(
            CONST_PUBKEY_ADDR.AURA,
            bech32.toWords(wordsByte),
          );
          // get validator detail
          const validatorUrl = `staking/validators/${data.operator_address}`;
          const validatorResponse = await this._commonUtil.getDataAPI(
            this.api,
            validatorUrl,
          );

          try {
            // create validator
            const status = Number(validatorResponse.result?.status) || 0;
            const validatorAddr = this._commonUtil.getAddressFromPubkey(
              data.consensus_pubkey.key,
            );

            // Makinf Validator entity to insert data
            const newValidator = SyncDataHelpers.makeValidatorData(
              data,
              account_address,
              status,
              validatorAddr,
            );

            const percentPower =
              (data.tokens / poolData.pool.bonded_tokens) * 100;
            newValidator.percent_power = percentPower.toFixed(2);
            const pubkey = this._commonUtil.getAddressFromPubkey(
              data.consensus_pubkey.key,
            );
            const address = this._commonUtil.hexToBech32(
              pubkey,
              CONST_PUBKEY_ADDR.AURAVALCONS,
            );
            const signingInfo = signingData.info.filter(
              (e) => e.address === address,
            );
            if (signingInfo.length > 0) {
              const signedBlocksWindow =
                slashingData.params.signed_blocks_window;
              const missedBlocksCounter = signingInfo[0].missed_blocks_counter;
              const upTime =
                ((Number(signedBlocksWindow) - Number(missedBlocksCounter)) /
                  Number(signedBlocksWindow)) *
                100;

              newValidator.up_time =
                String(upTime.toFixed(2)) + CONST_CHAR.PERCENT;
            }
            newValidator.self_bonded = 0;
            newValidator.percent_self_bonded = '0.00';
            try {
              // get delegations
              const paramDelegation = `cosmos/staking/v1beta1/validators/${data.operator_address}/delegations/${account_address}`;
              const delegationData = await this._commonUtil.getDataAPI(
                this.api,
                paramDelegation,
              );
              if (delegationData && delegationData.delegation_response) {
                newValidator.self_bonded =
                  delegationData.delegation_response.balance.amount;
                const percentSelfBonded =
                  (delegationData.delegation_response.balance.amount /
                    data.tokens) *
                  100;
                newValidator.percent_self_bonded =
                  percentSelfBonded.toFixed(2) + CONST_CHAR.PERCENT;
              }
            } catch (error) {
              this._logger.error(null, `Not exist delegations`);
            }
            validators.push(newValidator);
          } catch (error) {
            this.isSyncValidator = false;
            this._logger.error(`${error.name}: ${error.message}`);
            this._logger.error(`${error.stack}`);
          }
        }
      }
      if (validators.length > 0) {
        await this.validatorRepository.update(validators);
      }
      this.isSyncValidator = false;
    } catch (err) {
      this.isSyncValidator = false;
      this._logger.error(`${err.name}: ${err.message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async syncValidatorImage() {
    const limit = 20;
    const { validators, count } =
      await this.validatorRepository.getImageValidator(limit, 0);

    if (validators.length > 0) {
      this.pushDataToQueue(validators);
    }

    if (count > 0) {
      const pages = Math.ceil(count / limit);
      if (pages > 1) {
        for (let i = 1; i <= pages; i++) {
          const result = await this.validatorRepository.getImageValidator(
            limit,
            i,
          );
          this.pushDataToQueue(result.validators);
        }
      }
    }
  }

  /**
   * Push validators data to queue for image synchronization
   * @param data
   */
  pushDataToQueue(data: any) {
    this.validatorQueue.add(QUEUES.SYNC_VALIDATOR_IMAGE, data, {
      removeOnComplete: true,
      removeOnFail: false,
      delay: 5000,
      attempts: 3,
    });
  }
}
