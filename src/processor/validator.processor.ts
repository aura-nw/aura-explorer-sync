import { OnQueueError, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { bech32 } from 'bech32';
import { Job, Queue } from 'bull';
import {
  CONST_CHAR,
  CONST_MSG_TYPE,
  CONST_PUBKEY_ADDR,
  NODE_API,
  QUEUES,
} from '../common/constants/app.constant';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { DelegationRepository } from '../repositories/delegation.repository';
import { DelegatorRewardRepository } from '../repositories/delegator-reward.repository';
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
    const { txData, msg, txType, index } = job.data;
    switch (txType) {
      case CONST_MSG_TYPE.MSG_DELEGATE:
        await this.processDelegate(txData, msg, index);
        break;
      case CONST_MSG_TYPE.MSG_UNDELEGATE:
        await this.processUndelegate(txData, msg, index);
        break;
      case CONST_MSG_TYPE.MSG_REDELEGATE:
        await this.processUndelegate(txData, msg, index);
        break;
      case CONST_MSG_TYPE.MSG_WITHDRAW_DELEGATOR_REWARD:
        await this.processWithDrawDelegation(txData, msg, index);
        break;
      case CONST_MSG_TYPE.MSG_CREATE_VALIDATOR:
        await this.processValidator(msg.operator_address);
        await this.processDelegation(txData, msg);
        break;
    }
  }

  async processValidator(operatorAddress: string) {
    this.logger.log(
      `${this.processValidator.name} was called with paramter: ${operatorAddress}`,
    );
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

        // Makinf Validator entity to insert data
        const newValidator = SyncDataHelpers.makeValidatorData(
          validatorData,
          account_address,
          status,
          validatorAddr,
        );

        const percentPower =
          (validatorData.tokens / poolData.pool.bonded_tokens) * 100;
        newValidator.percent_power = percentPower.toFixed(2);
        const pubkey = this.commonUtil.getAddressFromPubkey(
          validatorData.consensus_pubkey.key,
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

          newValidator.up_time = String(upTime.toFixed(2)) + CONST_CHAR.PERCENT;
        }
        newValidator.self_bonded = 0;
        newValidator.percent_self_bonded = '0.00';
        try {
          // get delegations
          const paramDelegation = `cosmos/staking/v1beta1/validators/${validatorData.operator_address}/delegations/${account_address}`;
          const delegationData = await this.commonUtil.getDataAPI(
            this.api,
            paramDelegation,
          );
          if (delegationData && delegationData.delegation_response) {
            newValidator.self_bonded =
              delegationData.delegation_response.balance.amount;
            const percentSelfBonded =
              (delegationData.delegation_response.balance.amount /
                validatorData.tokens) *
              100;
            newValidator.percent_self_bonded =
              percentSelfBonded.toFixed(2) + CONST_CHAR.PERCENT;
          }
        } catch (error) {
          this.logger.error(null, `Not exist delegations`);
        }
        await this.validatorRepository.update(newValidator);
      } catch (error) {
        this.logger.error(`${error.name}: ${error.message}`);
        this.logger.error(`${error.stack}`);
      }
    }
  }

  async processDelegation(txData: any, message: any) {
    this.logger.log(`${this.processDelegation.name} was called!}`);
    const delegation = SyncDataHelpers.makeDelegationData(txData, message);
    await this.insertDelegation(delegation);
  }

  async processDelegatorReward(txData: any, message: any, index: number) {
    this.logger.log(`${this.processDelegatorReward.name} was called!}`);
    const [delegation, reward] = SyncDataHelpers.makeDelegateData(
      txData,
      message,
      index,
    );
    await this.insertDelegation(delegation);
    await this.insertDelegatorReward(reward);
  }

  async processDelegate(txData: any, message: any, index: number) {
    this.logger.log(`${this.processDelegate.name} was called!}`);
    const [delegation, reward] = SyncDataHelpers.makeDelegateData(
      txData,
      message,
      index,
    );
    await this.insertDelegation(delegation);
    await this.insertDelegatorReward(reward);
  }

  async processUndelegate(txData: any, message: any, index: number) {
    this.logger.log(`${this.processUndelegate.name} was called!}`);
    const [delegation, reward] = SyncDataHelpers.makeUndelegateData(
      txData,
      message,
      index,
    );
    await this.insertDelegation(delegation);
    await this.insertDelegatorReward(reward);
  }

  async processRedelegation(txData: any, message: any, index: number) {
    this.logger.log(`${this.processRedelegation.name} was called!}`);
    const [delegation1, delegation2, reward1, reward2] =
      SyncDataHelpers.makeRedelegationData(txData, message, index);
    const delegations = [delegation1, delegation2];
    const rewards = [reward1, reward2];
    await this.insertDelegation(delegations);
    await this.insertDelegatorReward(rewards);
  }

  async processWithDrawDelegation(txData: any, message: any, index: number) {
    this.logger.log(`${this.processWithDrawDelegation.name} was called!}`);
    const reward = SyncDataHelpers.makeWithDrawDelegationData(
      txData,
      message,
      index,
    );
    if (reward.amount) {
      await this.insertDelegatorReward(reward);
    }
  }

  /**
   * Insert data to delegations table
   * @param delegation
   */
  async insertDelegation(delegation: any | any[]) {
    await this.delegationRepository.insertOnDuplicate(delegation, ['id']);
  }

  /**
   * Insert data to delegator_rewards table
   * @param delegatorReward
   */
  async insertDelegatorReward(delegatorReward: any | any[]) {
    await this.delegatorRewardRepository.insertOnDuplicate(delegatorReward, [
      'id',
    ]);
  }

  @OnQueueError()
  onError(job: Job, error: Error) {
    this.logger.error(`Job: ${job}`);
    this.logger.error(`Error job ${job.id} of type ${job.name}`);
    this.logger.error(`Error: ${error}`);
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}`);
    this.logger.error(`Error: ${error}`);

    // Resart queue
    const queue = await job.queue;
    if (queue) {
      if (job.name === QUEUES.SYNC_INSTANTIATE_CONTRACTS) {
        await this.retryJobs(queue);
      }
    }
  }

  /**
   * Restart job fail
   * @param queue
   */
  async retryJobs(queue: Queue) {
    const jobs = await queue.getFailed();
    jobs.forEach(async (job) => {
      await job.retry();
    });
  }
}
