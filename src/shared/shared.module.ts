import { HttpModule, HttpService } from '@nestjs/axios';
import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonUtil } from 'src/utils/common.util';
import { ConfigService } from './services/config.service';
// import { AuthModule } from '../modules/auth/auth.module';
const providers = [ConfigService, CommonUtil];

@Global()
@Module({
  imports: [HttpModule, ScheduleModule.forRoot()],
  providers: [...providers],
  exports: [...providers],
})
export class SharedModule { }
