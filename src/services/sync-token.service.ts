import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bull';

import {
  COINGECKO_API,
  QUEUES,
  REDIS_KEY,
} from '../common/constants/app.constant';

import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { RedisUtil } from '../utils/redis.util';
import { Equal, In } from 'typeorm';
import { TokenMarkets } from '../entities';

@Injectable()
export class SyncTokenService {}
