import { OnQueueError, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { bech32 } from 'bech32';
import { Job, Queue } from 'bull';
import {
  CONST_CHAR,
  CONST_PUBKEY_ADDR,
  NODE_API,
  QUEUES,
} from '../common/constants/app.constant';
import { TRANSACTION_TYPE } from '../common/constants/transaction-type.enum';
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
    try {
      const { txData, msg, txType } = job.data;
      const addresses: string[] = [];
      switch (txType) {
        case TRANSACTION_TYPE.DELEGATE:
          addresses.push(msg.validator_address);
          await this.processDelegate(txData, msg);
          break;
        case TRANSACTION_TYPE.UNDELEGATE:
          addresses.push(msg.validator_address);
          await this.processUndelegate(txData, msg);
          break;
        case TRANSACTION_TYPE.REDELEGATE:
          addresses.push(msg.validator_dst_address);
          addresses.push(msg.validator_src_address);
          await this.processRedelegation(txData, msg);
          break;
        case TRANSACTION_TYPE.GET_REWARD:
          addresses.push(msg.validator_address);
          await this.processWithDrawDelegation(txData, msg);
          break;
        case TRANSACTION_TYPE.CREATE_VALIDATOR:
          addresses.push(msg.validator_address);
          await this.processDelegation(txData, msg);
          break;
      }
      await this.processValidator(addresses);
    } catch (error) {
      this.logger.error(`${error.name}: ${error.message}`);
      this.logger.error(`${error.stack}`);
      throw error;
    }
  }

  async processValidator(operatorAddresses: string[]) {
    this.logger.log(
      `${this.processValidator.name} was called with paramter: ${operatorAddresses}`,
    );
    const validators = [];
    try {
      for (const operatorAddress in operatorAddresses) {
        let validatorInfo = null;
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

  async processDelegation(txData: any, message: any) {
    this.logger.log(`${this.processDelegation.name} was called!}`);
    const delegation = SyncDataHelpers.makeDelegationData(txData, message);
    await this.insertDelegation([delegation]);
  }

  async processDelegate(txData: any, message: any) {
    this.logger.log(`${this.processDelegate.name} was called!}`);
    const [delegation, reward] = SyncDataHelpers.makeDelegateData(
      txData,
      message,
    );
    await this.insertDelegation([delegation]);
    await this.insertDelegatorReward([reward]);
  }

  async processUndelegate(txData: any, message: any) {
    this.logger.log(`${this.processUndelegate.name} was called!}`);
    const [delegation, reward] = SyncDataHelpers.makeUndelegateData(
      txData,
      message,
    );
    await this.insertDelegation([delegation]);
    await this.insertDelegatorReward([reward]);
  }

  async processRedelegation(txData: any, message: any) {
    this.logger.log(`${this.processRedelegation.name} was called!}`);
    const [delegation1, delegation2, reward1, reward2] =
      SyncDataHelpers.makeRedelegationData(txData, message);
    const delegations = [delegation1, delegation2];
    const rewards = [reward1, reward2];
    await this.insertDelegation(delegations);
    await this.insertDelegatorReward(rewards);
  }

  async processWithDrawDelegation(txData: any, message: any) {
    this.logger.log(`${this.processWithDrawDelegation.name} was called!}`);
    const reward = SyncDataHelpers.makeWithDrawDelegationData(txData, message);
    if (reward.amount) {
      await this.insertDelegatorReward([reward]);
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
