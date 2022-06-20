import { Injectable } from '@nestjs/common';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';
import { DATABASE_TYPE } from '../../common/constants/app.constant';
import { PROCESSOR_CONSTANTS } from '../constants/common.const';
import { PascalCaseStrategy } from '../pascalCase.strategy';

@Injectable()
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

  get timezone(): string {
    return this.get('APP_TIMEZONE');
  }

  get ENV_CONFIG() {
    return {
      REDIS_CONFIG: {
        HOST: `${this.get('REDIS_HOST')}`,
        PORT: `${this.get('REDIS_PORT')}`,
        PREFIX: `${this.get('REDIS_PREFIX')}`
      },
      THREADS: Number(this.get('THREADS')),
      JOB_OPTIONS: {
        ATTEMPTS: Number(this.get('REDIS_HOST')) || 3,
        BACK_OFF: Number(this.get('BACK_OFF')) || 1000
      }
    };
  }

  get registerQueue() {
    const threads = Number(this.get('THREADS'));
    const queues = [];
    for (let idx = 1; idx <= threads; idx++) {
      queues.push({ name: `${PROCESSOR_CONSTANTS.SYNC_BLOCK}_${idx}` });
    }
    return queues;
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
      logging: this.nodeEnv === 'development',
      namingStrategy: new PascalCaseStrategy(),
      multipleStatements: true,
    };
  }
}

export const ENV_CONFIG = new ConfigService().ENV_CONFIG;
