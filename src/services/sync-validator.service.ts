import { Injectable, Logger } from '@nestjs/common';
import { ValidatorRepository } from '../repositories/validator.repository';
import { bech32 } from 'bech32';
import { CronExpression, Interval } from '@nestjs/schedule';
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
import * as util from 'util';

@Injectable()
export class SyncValidatorService {
  private readonly _logger = new Logger(SyncValidatorService.name);
  private isSyncValidator = false;
  private api = '';

  constructor(
    private _commonUtil: CommonUtil,
    @InjectQueue('validator') private readonly validatorQueue: Queue,
  ) {
    this.api = ENV_CONFIG.NODE.API;

    // Sync Image Validator when app start
    // (async () => {
    //   await this.syncValidatorImage();
    // })();

    this.validatorQueue.add(
      QUEUES.SYNC_VALIDATOR_IMAGE,
      {},
      {
        repeat: { cron: CronExpression.EVERY_DAY_AT_MIDNIGHT },
      },
    );
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
      const signing = [];
      const listValidator = [];
      let valNextKey = '';
      let signNextKey = '';

      // get staking pool
      const paramspool = NODE_API.STAKING_POOL;
      // get slashing param
      const paramsSlashing = NODE_API.SLASHING_PARAM;

      do {
        const paramsValidator = `${this.api}${util.format(
          NODE_API.LIST_VALIDATOR,
          encodeURIComponent(valNextKey),
        )}`;
        const validatorData = await this._commonUtil.getDataAPI(
          paramsValidator,
          '',
        );
        valNextKey = validatorData?.pagination?.next_key;
        validators.push(...validatorData?.validators);
      } while (!!valNextKey);

      do {
        const paramsSigning = `${this.api}${util.format(
          NODE_API.LIST_SIGNING_INFOS,
          encodeURIComponent(signNextKey),
        )}`;
        const signingData = await this._commonUtil.getDataAPI(
          paramsSigning,
          '',
        );
        signNextKey = signingData?.pagination?.next_key;
        signing.push(...signingData?.info);
      } while (!!signNextKey);

      const [poolData, slashingData] = await Promise.all([
        this._commonUtil.getDataAPI(this.api, paramspool),
        this._commonUtil.getDataAPI(this.api, paramsSlashing),
      ]);

      if (validators.length > 0) {
        this.isSyncValidator = true;
        for (const key in validators) {
          const data = validators[key];
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
            const signingInfo = signing.filter((e) => e.address === address);
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
            listValidator.push(newValidator);
          } catch (error) {
            this.isSyncValidator = false;
            this._logger.error(`${error.name}: ${error.message}`);
            this._logger.error(`${error.stack}`);
          }
        }
      }
      if (listValidator.length > 0) {
        this.pushDataToQueue(listValidator, QUEUES.SYNC_LIST_VALIDATOR);
      }
      this.isSyncValidator = false;
    } catch (err) {
      this.isSyncValidator = false;
      this._logger.error(`${err.name}: ${err.message}`);
    }
  }

  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  // async syncValidatorImage() {
  //   const limit = 20;
  //   const { validators, count } =
  //     await this.validatorRepository.getImageValidator(limit, 0);

  //   if (validators.length > 0) {
  //     this.pushDataToQueue(validators, QUEUES.SYNC_VALIDATOR_IMAGE);
  //   }

  //   if (count > 0) {
  //     const pages = Math.ceil(count / limit);
  //     if (pages > 1) {
  //       for (let i = 1; i <= pages; i++) {
  //         const result = await this.validatorRepository.getImageValidator(
  //           limit,
  //           i,
  //         );
  //         this.pushDataToQueue(result.validators, QUEUES.SYNC_VALIDATOR_IMAGE);
  //       }
  //     }
  //   }
  // }

  /**
   * Push validators data to queue for image synchronization
   * @param data
   */
  pushDataToQueue(data: any, queue: string) {
    this.validatorQueue.add(queue, data, {
      removeOnComplete: true,
      removeOnFail: false,
      delay: 5000,
      attempts: 3,
    });
  }
}
