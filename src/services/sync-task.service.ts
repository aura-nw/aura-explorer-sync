import { Injectable, Logger } from '@nestjs/common';
import { CronExpression, Interval } from '@nestjs/schedule';
import { sha256 } from 'js-sha256';
import { InjectSchedule, Schedule } from 'nest-schedule';
import {
  CONST_CHAR,
  CONST_MSG_TYPE,
  NODE_API,
  QUEUES,
  SMART_CONTRACT_VERIFICATION,
} from '../common/constants/app.constant';
import { BlockSyncError } from '../entities';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { BlockSyncErrorRepository } from '../repositories/block-sync-error.repository';
import { MissedBlockRepository } from '../repositories/missed-block.repository';
import { ProposalVoteRepository } from '../repositories/proposal-vote.repository';
import { SyncStatusRepository } from '../repositories/sync-status.repository';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { InfluxDBClient } from '../utils/influxdb-client';
import { InjectQueue } from '@nestjs/bull';
import { BackoffOptions, CronRepeatOptions, JobOptions, Queue } from 'bull';
import { SmartContractCodeRepository } from '../repositories/smart-contract-code.repository';
import { TRANSACTION_TYPE } from '../common/constants/transaction-type.enum';
import * as util from 'util';
import { DelegationRepository } from '../repositories/delegation.repository';
import { DelegatorRewardRepository } from '../repositories/delegator-reward.repository';
import { TransactionHelper } from '../helpers/transaction.helper';
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import { In } from 'typeorm';
@Injectable()
export class SyncTaskService {}
