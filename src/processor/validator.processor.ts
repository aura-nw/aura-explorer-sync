import {
  InjectQueue,
  OnQueueError,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import {
  CONST_CHAR,
  INDEXER_V2_API,
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

  constructor(
    private commonUtil: CommonUtil,
    private validatorRepository: ValidatorRepository,
    @InjectQueue('validator') private readonly validatorQueue: Queue,
  ) {
    this.logger.log(
      '============== Constructor Validator Processor Service ==============',
    );

    this.validatorQueue.add(
      QUEUES.SYNC_LIST_VALIDATOR,
      {},
      {
        repeat: { cron: CronExpression.EVERY_10_SECONDS },
      },
    );

    this.validatorQueue.add(
      QUEUES.SYNC_VALIDATOR_IMAGE,
      {},
      {
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

      //get list validator
      const validatorAttributes = `description
                                    operator_address
                                    account_address
                                    consensus_hex_address
                                    percent_voting_power
                                    tokens
                                    jailed
                                    uptime
                                    status
                                    unbonding_height
                                    start_height
                                    unbonding_time
                                    consensus_pubkey
                                    delegator_shares
                                    commission
                                    self_delegation_balance
                                    min_self_delegation`;

      const graphqlQuery = {
        query: util.format(
          INDEXER_V2_API.GRAPH_QL.LIST_VALIDATOR,
          validatorAttributes,
        ),
      };
      const validatorsData = (
        await this.commonUtil.fetchDataFromGraphQL(
          ENV_CONFIG.INDEXER_V2.GRAPH_QL,
          'POST',
          graphqlQuery,
        )
      ).data[ENV_CONFIG.INDEXER_V2.CHAIN_DB]['validator'];

      // assign validators attributes
      if (validatorsData.length > 0) {
        // calculate equal power threshold
        const numOfValidators = validatorsData.filter(
          (x) => x.status === 'BOND_STATUS_BONDED',
        ).length;
        let equalPT = 0;
        if (numOfValidators > 0) {
          equalPT = Number((100 / numOfValidators).toFixed(2));
        }
        listValidator = Object.entries(validatorsData).map(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ([key, validatorData]) =>
            this.assignAttrsForValidator(validatorData, equalPT),
        );
      }
      // update list validator
      if (listValidator.length > 0) {
        await this.processListValidator(listValidator);
      }
    } catch (error) {
      const errorMsg = `Error while processing list validator ${error}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
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
      const errorMsg = `Error while syncing validators image ${error}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
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
   * Assign attributes for validator
   * @param validatorData, equalPT
   */
  assignAttrsForValidator(validatorData, equalPT) {
    let validator;

    try {
      // Make Validator entity to insert data
      validator = SyncDataHelpers.makeValidatorData(validatorData);

      // Calculate power
      if (Number(validator.percent_power) < equalPT) {
        validator.voting_power_level = VOTING_POWER_LEVEL.GREEN;
      } else if (Number(validator.percent_power) < 3 * equalPT) {
        validator.voting_power_level = VOTING_POWER_LEVEL.YELLOW;
      } else {
        validator.voting_power_level = VOTING_POWER_LEVEL.RED;
      }

      const percentSelfBonded =
        (validator.self_bonded / validatorData.tokens) * 100;
      validator.percent_self_bonded =
        percentSelfBonded.toFixed(2) + CONST_CHAR.PERCENT;
    } catch (error) {
      const errorMsg = `Error while assigning validator attributes ${error}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
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
