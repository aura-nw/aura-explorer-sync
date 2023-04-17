import {
  InjectQueue,
  OnQueueError,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { bech32 } from 'bech32';
import { Job, Queue } from 'bull';
import {
  CONST_CHAR,
  CONST_PUBKEY_ADDR,
  NODE_API,
  QUEUES,
  VOTING_POWER_LEVEL,
} from '../common/constants/app.constant';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { ValidatorRepository } from '../repositories/validator.repository';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import * as util from 'util';
import { CronExpression } from '@nestjs/schedule';

@Processor('validator')
export class ValidatorProcessor {
  private readonly logger = new Logger(ValidatorProcessor.name);
  private api = '';
  private keybaseUrl = '';

  constructor(
    private commonUtil: CommonUtil,
    private validatorRepository: ValidatorRepository,
    @InjectQueue('validator') private readonly validatorQueue: Queue,
  ) {
    this.logger.log(
      '============== Constructor Validator Processor Service ==============',
    );

    this.api = ENV_CONFIG.NODE.API;
    this.keybaseUrl = ENV_CONFIG.KEY_BASE_URL;

    this.validatorQueue.add(
      QUEUES.SYNC_LIST_VALIDATOR,
      {},
      {
        removeOnFail: false,
        repeat: { cron: CronExpression.EVERY_10_SECONDS },
      },
    );

    this.validatorQueue.add(
      QUEUES.SYNC_VALIDATOR_IMAGE,
      {},
      {
        removeOnFail: false,
        repeat: { cron: CronExpression.EVERY_DAY_AT_MIDNIGHT },
      },
    );

    // update validators image on app bootstrap
    (async () => {
      const validatorsImg = await this.validatorRepository.getImageValidator();
      await this.updateValidatorsImage(validatorsImg);
    })();
  }

  @Process(QUEUES.SYNC_LIST_VALIDATOR)
  async syncListValidator(job) {
    this.logger.log(
      `${this.syncListValidator.name} is processing job: ${job.id}`,
    );

    try {
      let listValidator = [];

      // get staking pool, slashing param, list validator, list signing
      const [poolData, slashingData, validatorsData, signingData] =
        await Promise.all([
          this.commonUtil.getDataAPI(this.api, NODE_API.STAKING_POOL),
          this.commonUtil.getDataAPI(this.api, NODE_API.SLASHING_PARAM),
          this.fetchPaginatedDataByKey(NODE_API.LIST_VALIDATOR, 'validators'),
          this.fetchPaginatedDataByKey(NODE_API.LIST_SIGNING_INFOS, 'info'),
        ]);

      // assign validators attributes
      if (validatorsData.length > 0) {
        const numOfValidators = validatorsData.filter((x) => !x.jailed).length;
        let equalPT = 0;
        if (numOfValidators > 0) {
          equalPT = Number((100 / numOfValidators).toFixed(2));
        }
        listValidator = await Promise.all(
          Object.entries(validatorsData).map(
            async ([key, validatorData]) =>
              await this.assignAttrsForValidator(
                validatorData,
                poolData,
                signingData,
                slashingData,
                equalPT,
              ),
          ),
        );
      }
      // update list validator
      if (listValidator.length > 0) {
        await this.processListValidator(listValidator);
      }
    } catch (error) {
      this.logger.error(`${error.name}: ${error.message}`);
      throw error;
    }
  }

  @Process(QUEUES.SYNC_VALIDATOR_IMAGE)
  async syncValidatorImage(job: Job) {
    this.logger.log(
      `${this.syncListValidator.name} is processing job: ${job.id}`,
    );

    try {
      const validatorsImg = await this.validatorRepository.getImageValidator();
      await this.updateValidatorsImage(validatorsImg);
    } catch (error) {
      this.logger.error(
        `${this.syncValidatorImage.name} error while processing.`,
      );
      throw error;
    }
  }

  @OnQueueError()
  onError(error: Error) {
    this.logger.error(`Queue Error: ${error.stack}`);
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}`);
    this.logger.error(`Error: ${error}`);
  }

  /**
   * Update batch validator and remove signed out validator.
   * @param data
   */
  async processListValidator(listValidator) {
    await this.validatorRepository.update(listValidator);
    const validatorsDB = await this.validatorRepository.findAll();
    const operators = validatorsDB
      .filter(
        (element) =>
          !listValidator
            .map((item) => item.operator_address)
            .includes(element.operator_address),
      )
      .map((item) => item.operator_address);
    await this.validatorRepository.removeUndelegateValidator(operators);
  }

  /**
   * Fetch data from api and get an value by obj key
   * @param path, key
   */
  async fetchPaginatedDataByKey(path, key): Promise<any> {
    const result = [];
    let nextKey = '';

    do {
      const params = `${this.api}${util.format(
        path,
        encodeURIComponent(nextKey),
      )}`;
      const data = await this.commonUtil.getDataAPI(params, '');

      nextKey = data?.pagination?.nextKey;
      result.push(...data[key]);
    } while (!!nextKey);

    return result;
  }

  /**
   * Assign attributes for validator
   * @param validatorData, poolData, signing, slashingData, equalPT
   */
  async assignAttrsForValidator(
    validatorData,
    poolData,
    signing,
    slashingData,
    equalPT,
  ): Promise<any> {
    let validator;
    // get account address
    const operator_address = validatorData.operator_address;
    const decodeAcc = bech32.decode(operator_address, 1023);
    const wordsByte = bech32.fromWords(decodeAcc.words);
    const account_address = bech32.encode(
      CONST_PUBKEY_ADDR.AURA,
      bech32.toWords(wordsByte),
    );
    // get validator detail
    const validatorUrl = `staking/validators/${validatorData.operator_address}`;
    const validatorResponse = await this.commonUtil.getDataAPI(
      this.api,
      validatorUrl,
    );
    try {
      // create validator
      const status = Number(validatorResponse.result?.status) || 0;
      const validatorAddr = this.commonUtil.getAddressFromPubkey(
        validatorData.consensus_pubkey.key,
      );

      // Make Validator entity to insert data
      validator = SyncDataHelpers.makeValidatorData(
        validatorData,
        account_address,
        status,
        validatorAddr,
      );

      // Calculate power
      const percentPower =
        (validatorData.tokens / poolData.pool.bonded_tokens) * 100;
      validator.percent_power = percentPower.toFixed(2);

      if (Number(validator.percent_power) < equalPT) {
        validator.voting_power_level = VOTING_POWER_LEVEL.GREEN;
      } else if (Number(validator.percent_power) < 3 * equalPT) {
        validator.voting_power_level = VOTING_POWER_LEVEL.YELLOW;
      } else {
        validator.voting_power_level = VOTING_POWER_LEVEL.RED;
      }

      const pubkey = this.commonUtil.getAddressFromPubkey(
        validatorData.consensus_pubkey.key,
      );
      const address = this.commonUtil.hexToBech32(
        pubkey,
        CONST_PUBKEY_ADDR.AURAVALCONS,
      );
      const signingInfo = signing.filter((e) => e.address === address);
      if (signingInfo.length > 0) {
        const signedBlocksWindow = slashingData.params.signed_blocks_window;
        const missedBlocksCounter = signingInfo[0].missed_blocks_counter;
        const upTime =
          ((Number(signedBlocksWindow) - Number(missedBlocksCounter)) /
            Number(signedBlocksWindow)) *
          100;

        validator.up_time = String(upTime.toFixed(2)) + CONST_CHAR.PERCENT;
      }
      validator.self_bonded = 0;
      validator.percent_self_bonded = '0.00';
      try {
        // get delegations
        const paramDelegation = `cosmos/staking/v1beta1/validators/${validatorData.operator_address}/delegations/${account_address}`;
        const delegationData = await this.commonUtil.getDataAPI(
          this.api,
          paramDelegation,
        );
        if (delegationData && delegationData.delegation_response) {
          validator.self_bonded =
            delegationData.delegation_response.balance.amount;
          const percentSelfBonded =
            (delegationData.delegation_response.balance.amount /
              validatorData.tokens) *
            100;
          validator.percent_self_bonded =
            percentSelfBonded.toFixed(2) + CONST_CHAR.PERCENT;
        }
      } catch (error) {
        this.logger.error(null, `Not exist delegations`);
        throw error;
      }
    } catch (error) {
      this.logger.error(`${error.name}: ${error.message}`);
      this.logger.error(`${error.stack}`);
      throw error;
    }
    return validator;
  }

  /**
   * Update data for image_url column
   * @param data
   */
  async updateValidatorsImage(data: any) {
    const validators = await Promise.all(
      data.map(async (item) => {
        if (item.identity?.length > 0) {
          // Call keybase get data
          item.image_url = await this.commonUtil.getImageFromKeyBase(
            item.identity,
          );
        } else {
          item.image_url = `validator-default.svg`;
        }
        return item;
      }),
    );

    if (validators.length > 0) {
      await this.validatorRepository.update(validators);
    }
  }
}
