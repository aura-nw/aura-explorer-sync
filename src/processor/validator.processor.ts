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
export class ValidatorProcessor {}
