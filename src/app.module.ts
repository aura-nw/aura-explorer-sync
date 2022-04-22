import { CacheModule, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ENTITIES_CONFIG,
  REPOSITORY_INTERFACE,
  SERVICE_INTERFACE,
} from './module.config';
import { ConfigService } from './shared/services/config.service';
import { SharedModule } from './shared/shared.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncProposalService } from './services/impls/sync-proposal.service';
import { SyncTaskService } from './services/impls/sync-task.service';
import { Repository } from 'typeorm';
import { BlockSyncErrorRepository } from './repositories/impls/block-sync-error.repository';
import { MissedBlockRepository } from './repositories/impls/missed-block.repository';
import { ProposalRepository } from './repositories/impls/proposal.repository';
import { ValidatorRepository } from './repositories/impls/validator.repository';

const controllers = [];
const entities = [ENTITIES_CONFIG.BLOCK_SYNC_ERROR, ENTITIES_CONFIG.MISSED_BLOCK, ENTITIES_CONFIG.PROPOSAL, ENTITIES_CONFIG.VALIDATOR];
@Module({
  imports: [
    ScheduleModule.forRoot(),
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
    CacheModule.register({ ttl: 10000 }),
    SharedModule,
    TypeOrmModule.forFeature([...entities]),
    TypeOrmModule.forRootAsync({
      imports: [SharedModule],
      useFactory: (configService: ConfigService) => configService.typeOrmConfig,
      inject: [ConfigService],
    }),
  ],
  controllers: [...controllers],
  providers: [
    //repository
    {
      provide: REPOSITORY_INTERFACE.IBLOCK_SYNC_ERROR_REPOSITORY,
      useClass: BlockSyncErrorRepository,
    },
    {
      provide: REPOSITORY_INTERFACE.IMISSED_BLOCK_REPOSITORY,
      useClass: MissedBlockRepository,
    },
    {
      provide: REPOSITORY_INTERFACE.IPROPOSAL_REPOSITORY,
      useClass: ProposalRepository,
    },
    {
      provide: REPOSITORY_INTERFACE.IVALIDATOR_REPOSITORY,
      useClass: ValidatorRepository,
    },
    //service
    {
      provide: SERVICE_INTERFACE.ISYNC_PROPOSAL_SERVICE,
      useClass: SyncProposalService,
    },
    {
      provide: SERVICE_INTERFACE.ISYNC_TASK_SERVICE,
      useClass: SyncTaskService,
    },
  ],
})
export class AppModule {}
