import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';
import { DATABASE_TYPE } from '../../common/constants/app.constant';
import { PascalCaseStrategy } from '../pascalCase.strategy';

export class ConfigService {
  constructor() {
    dotenv.config({
      path: `.env`,
    });

    // Replace \\n with \n to support multiline strings in AWS
    for (const envName of Object.keys(process.env)) {
      process.env[envName] = process.env[envName].replace(/\\n/g, '\n');
    }
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  public get(key: string): string {
    return process.env[key];
  }

  public getNumber(key: string): number {
    return Number(this.get(key));
  }

  get nodeEnv(): string {
    return this.get('NODE_ENV') || 'development';
  }

  get ENV_CONFIG() {
    return {
      WEBSOCKET_URL: process.env.WEBSOCKET_URL,
      THREADS: Number(process.env.THREADS),
      SMART_CONTRACT_SERVICE: process.env.SMART_CONTRACT_SERVICE,
      START_HEIGHT: process.env.START_HEIGHT,
      TIMES_SYNC: Number(process.env.TIMES_SYNC) || 3000,
      SYNC_TRANSACTIONS_CLEAN_UP_DAY: Number(
        process.env.SYNC_TRANSACTIONS_CLEAN_UP_DAY || 8,
      ),
      BLOCK_START: Number(process.env.BLOCK_START) || 0,
      SYNC_DATA_INFLUXD:
        process.env.SYNC_DATA_INFLUXD === 'true' ? true : false,
      REDIS: {
        HOST: process.env.REDIS_HOST,
        PORT: Number(process.env.REDIS_PORT) || 6379,
        PREFIX: process.env.REDIS_PREFIX,
        DB: process.env.REDIS_DB,
        USERNAME:
          !process.env.REDIS_USERNAME ||
          process.env.REDIS_USERNAME === 'default'
            ? ''
            : process.env.REDIS_USERNAME,
        PASSWORD: process.env.REDIS_PASSWORD || '',
      },
      NODE: {
        API: process.env.API,
        RPC: process.env.RPC,
      },
      CHAIN_INFO: {
        COIN_DENOM: process.env.COIN_DENOM,
        COIN_MINIMAL_DENOM: process.env.COIN_MINIMAL_DENOM,
        COIN_DECIMALS: Number(process.env.COIN_DECIMALS),
        PRECISION_DIV: Math.pow(10, Number(process.env.COIN_DECIMALS)),
      },
      INFLUX_DB: {
        BUCKET: process.env.INFLUXDB_BUCKET,
        ORGANIZTION: process.env.INFLUXDB_ORG,
        URL: process.env.INFLUXDB_URL,
        TOKEN: process.env.INFLUXDB_TOKEN,
      },
      COINGECKO: {
        API: process.env.COINGECKO_API,
        COIN_ID: process.env.COINGECKO_COIN_ID,
        MAX_REQUEST: Number(process.env.COINGECKO_MAX_REQUEST) || 250,
        COINGEKO_PLATFORM: process.env.COINGEKO_PLATFORM || 'ethereum',
      },
      SYNC_SMART_CONTRACT: {
        FROM_HEIGHT: Number(process.env.SYNC_SMART_CONTRACT_FROM_HEIGHT) || 0,
        TO_HEIGHT: Number(process.env.SYNC_SMART_CONTRACT_TO_HEIGHT) || 0,
        SYNC_DATA:
          process.env.SYNC_SMART_CONTRACT_SYNC_DATA === 'true' ? true : false,
      },
      NODE_ENV: process.env.NODE_ENV,
    };
  }

  get typeOrmConfig(): TypeOrmModuleOptions {
    const entities = [__dirname + '/../../entities/**/*.entity{.ts,.js}'];
    const migrations = [__dirname + '/../../migrations/*{.ts,.js}'];

    return {
      entities,
      migrations,
      type: DATABASE_TYPE.MYSQL,
      host: this.get('DB_HOST'),
      port: this.getNumber('DB_PORT'),
      username: this.get('DB_USER'),
      password: this.get('DB_PASS'),
      database: this.get('DB_NAME'),
      migrationsRun: true,
      connectTimeout: 1000,
      synchronize: false,
      logging: this.get('DB_LOGGING') === 'true',
      namingStrategy: new PascalCaseStrategy(),
      multipleStatements: true,
    };
  }
}

export const ENV_CONFIG = new ConfigService().ENV_CONFIG;
