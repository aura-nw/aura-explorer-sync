import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { Queue } from 'bull';
import { In } from 'typeorm';
import * as util from 'util';
import {
  CONTRACT_CODE_RESULT,
  CONTRACT_CODE_STATUS,
  CONTRACT_TYPE,
  INDEXER_API,
  NODE_API,
  QUEUES,
} from '../common/constants/app.constant';
import { SmartContract, SmartContractCode, TokenMarkets } from '../entities';
import { SmartContractCodeRepository } from '../repositories/smart-contract-code.repository';
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import { ConfigService, ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';

@Injectable()
export class SyncContractCodeService {}
