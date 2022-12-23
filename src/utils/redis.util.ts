import { Injectable, Logger } from '@nestjs/common';
import * as redis from 'redis';
import { ENV_CONFIG } from '../shared/services/config.service';
// const redis = require('redis');

@Injectable()
export class RedisUtil {
  private readonly _logger = new Logger(RedisUtil.name);
  private redisClient;

  constructor() {
    const redisURL = {
      url: `redis://${ENV_CONFIG.REDIS.USERNAME}:${ENV_CONFIG.REDIS.PASSWORD}@${ENV_CONFIG.REDIS.HOST}:${ENV_CONFIG.REDIS.PORT}`,
    };
    this.redisClient = redis.createClient(redisURL);
  }

  public async connect() {
    try {
      if (!this.redisClient.isOpen) {
        await this.redisClient.connect();
      }
      this._logger.log('Connect to redis completed...!');
    } catch (err) {
      this._logger.log(`Connect to redis is error: ${err.stack}`);
    }
  }

  public async setValue(key: string, data: any) {
    await this.redisClient.set(key, JSON.stringify(data));
  }

  public async getValue(key: string) {
    return this.redisClient.get(key);
  }
}
