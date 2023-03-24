import {
  OnQueueCompleted,
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
  QUEUES_STATUS,
} from '../common/constants/app.constant';
import { TRANSACTION_TYPE } from '../common/constants/transaction-type.enum';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { DelegationRepository } from '../repositories/delegation.repository';
import { DelegatorRewardRepository } from '../repositories/delegator-reward.repository';
import { QueueInfoRepository } from '../repositories/queue-info.repository';
import { ValidatorRepository } from '../repositories/validator.repository';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';

@Processor('validator')
export class ValidatorProcessor {
  private readonly logger = new Logger(ValidatorProcessor.name);
  private api = '';

  constructor(
    private commonUtil: CommonUtil,
    private validatorRepository: ValidatorRepository,
    private delegationRepository: DelegationRepository,
    private delegatorRewardRepository: DelegatorRewardRepository,
    private queueInfoRepository: QueueInfoRepository,
  ) {
    this.logger.log(
      '============== Constructor Validator Processor Service ==============',
    );

    this.api = ENV_CONFIG.NODE.API;
  }

  @Process(QUEUES.SYNC_VALIDATOR)
  async syncValidator(job: Job) {
    this.logger.log(
      `${this.syncValidator.name} was called with para: ${JSON.stringify(
        job.data,
      )}`,
    );
    await this.processValidator(job.data);
  }

  async processValidator(operatorAddresses: string[]) {
    this.logger.log(
      `${this.processValidator.name} was called with paramter: ${operatorAddresses}`,
    );
    const validators = [];
    try {
      for (const index in operatorAddresses) {
        let validatorInfo = null;
        const operatorAddress = operatorAddresses[index];
        // get validators
        const paramsValidator = `${NODE_API.VALIDATOR}/${operatorAddress}`;
        // get staking pool
        const paramspool = NODE_API.STAKING_POOL;
        // get slashing param
        const paramsSlashing = NODE_API.SLASHING_PARAM;
        // get slashing signing info
        const paramsSigning = NODE_API.SIGNING_INFOS;
        const [validatorData, poolData, slashingData, signingData] =
          await Promise.all([
            this.commonUtil.getDataAPI(this.api, paramsValidator),
            this.commonUtil.getDataAPI(this.api, paramspool),
            this.commonUtil.getDataAPI(this.api, paramsSlashing),
            this.commonUtil.getDataAPI(this.api, paramsSigning),
          ]);
        if (validatorData) {
          validatorInfo = validatorData.validator;
          // get account address
          const decodeAcc = bech32.decode(operatorAddress, 1023);
          const wordsByte = bech32.fromWords(decodeAcc.words);
          const account_address = bech32.encode(
            CONST_PUBKEY_ADDR.AURA,
            bech32.toWords(wordsByte),
          );
          // get validator detail
          const validatorUrl = `staking/validators/${operatorAddress}`;
          const validatorResponse = await this.commonUtil.getDataAPI(
            this.api,
            validatorUrl,
          );

          // create validator
          const status = Number(validatorResponse.result?.status) || 0;
          const validatorAddr = this.commonUtil.getAddressFromPubkey(
            validatorInfo.consensus_pubkey.key,
          );

          // Makinf Validator entity to insert data
          const newValidator = SyncDataHelpers.makeValidatorData(
            validatorInfo,
            account_address,
            status,
            validatorAddr,
          );

          const percentPower =
            (validatorInfo.tokens / poolData.pool.bonded_tokens) * 100;
          newValidator.percent_power = percentPower.toFixed(2);
          const pubkey = this.commonUtil.getAddressFromPubkey(
            validatorInfo.consensus_pubkey.key,
          );
          const address = this.commonUtil.hexToBech32(
            pubkey,
            CONST_PUBKEY_ADDR.AURAVALCONS,
          );
          const signingInfo = signingData.info.filter(
            (e) => e.address === address,
          );
          if (signingInfo.length > 0) {
            const signedBlocksWindow = slashingData.params.signed_blocks_window;
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
            const paramDelegation = `cosmos/staking/v1beta1/validators/${operatorAddress}/delegations/${account_address}`;
            const delegationData = await this.commonUtil.getDataAPI(
              this.api,
              paramDelegation,
            );
            if (delegationData && delegationData.delegation_response) {
              newValidator.self_bonded =
                delegationData.delegation_response.balance.amount;
              const percentSelfBonded =
                (delegationData.delegation_response.balance.amount /
                  validatorInfo.tokens) *
                100;
              newValidator.percent_self_bonded =
                percentSelfBonded.toFixed(2) + CONST_CHAR.PERCENT;
            }
          } catch (error) {
            this.logger.error(null, `Not exist delegations`);
          }
          validators.push(newValidator);
        }
      }
      if (validators.length > 0) {
        await this.validatorRepository.update(validators);
      }
    } catch (error) {
      this.logger.error(`${error.name}: ${error.message}`);
      this.logger.error(`${error.stack}`);
      throw error;
    }
  }

  @OnQueueCompleted()
  async onComplete(job: Job, result: any) {
    this.logger.log(`Completed job ${job.id} of type ${job.name}`);
    this.logger.log(`Result: ${result}`);
    await this.queueInfoRepository.updateQueueStatus(
      job.id,
      job.name,
      QUEUES_STATUS.SUCCESS,
    );
  }

  @OnQueueError()
  async onError(job: Job, error: Error) {
    this.logger.error(`Queue Error: ${error.stack}`);
    await this.queueInfoRepository.updateQueueStatus(
      job.id,
      job.name,
      QUEUES_STATUS.FAILED,
    );
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}`);
    this.logger.error(`Error: ${error}`);
    await this.queueInfoRepository.updateQueueStatus(
      job.id,
      job.name,
      QUEUES_STATUS.FAILED,
    );
  }
}
