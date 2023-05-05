import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { InjectSchedule, Schedule } from 'nest-schedule';
import { INDEXER_API } from 'src/common/constants/app.constant';
import { TransactionHelper } from 'src/helpers/transaction.helper';
import { BlockRepository } from 'src/repositories/block.repository';
import { TransactionRepository } from 'src/repositories/transaction.repository';
import { ConfigService, ENV_CONFIG } from 'src/shared/services/config.service';
import * as util from 'util';
import { CommonUtil } from '../utils/common.util';

@Injectable()
export class SyncTransactionService {}
