import { Injectable, Logger } from '@nestjs/common';
import { INDEXER_API, QUEUES } from '../common/constants/app.constant';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { InjectSchedule, Schedule } from 'nest-schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService, ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import * as util from 'util';

@Injectable()
export class SyncSmartContractService {}
