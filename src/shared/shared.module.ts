import { HttpModule, HttpService } from '@nestjs/axios';
import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonUtil } from '../utils/common.util';
import { RedisUtil } from '../utils/redis.util';
import { ConfigService } from './services/config.service';
import { InfluxDBClient } from 'src/utils/influxdb-client';
// import { AuthModule } from '../modules/auth/auth.module';
const providers = [ConfigService, CommonUtil, RedisUtil, InfluxDBClient];

@Global()
@Module({
  imports: [HttpModule, ScheduleModule.forRoot()],
  providers: [...providers],
  exports: [...providers],
})
export class SharedModule {}
