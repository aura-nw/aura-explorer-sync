import { CacheModule, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ENTITIES_CONFIG,
  REPOSITORY_INTERFACE,
  SERVICE_INTERFACE,
} from './module.config';
import { ConfigService, ENV_CONFIG } from './shared/services/config.service';
import { SharedModule } from './shared/shared.module';
import { ScheduleModule } from 'nest-schedule';
import { SyncProposalService } from './services/impls/sync-proposal.service';
import { SyncTaskService } from './services/impls/sync-task.service';
import { BlockSyncErrorRepository } from './repositories/impls/block-sync-error.repository';
import { MissedBlockRepository } from './repositories/impls/missed-block.repository';
import { ProposalRepository } from './repositories/impls/proposal.repository';
import { ValidatorRepository } from './repositories/impls/validator.repository';
import { BlockRepository } from './repositories/impls/block.repository';
import { DelegationRepository } from './repositories/impls/delegation.repository';
import { DelegatorRewardRepository } from './repositories/impls/delegator-reward.repository';
import { HistoryProposalRepository } from './repositories/impls/history-proposal.repository';
import { ProposalDepositRepository } from './repositories/impls/proposal-deposit.repository';
import { ProposalVoteRepository } from './repositories/impls/proposal-vote.repository';
import { SyncStatusRepository } from './repositories/impls/sync-status.repository';
import { TransactionRepository } from './repositories/impls/transaction.repository';
import { SyncWebsocketService } from './services/impls/sync-websocket.service';
import { SmartContractRepository } from './repositories/impls/smart-contract.repository';
import { TokenContractRepository } from './repositories/impls/token-contract.repository';
import { BullModule } from "@nestjs/bull";
import { PROCESSOR_CONSTANTS } from './common/constants/common.const';
import { SyncBlockConsumer } from './shared/consumers/sync-block.consumer';
import { SyncStatusService } from './services/impls/sync-status.service';
import { BlockSyncErrorService } from './services/impls/block-sync-error.service';
import { SyncMissedBlockConsumer } from './shared/consumers/sync-missed-block.consumer';
import { BlockSyncErrorConsumer } from './shared/consumers/block-sync-error.consumer';
import { SyncValidatorConsumer } from './shared/consumers/sync-validator.consumer';
import { SyncProposalConsumer } from './shared/consumers/sync-proposal.consumer';

const controllers = [];
const entities = [
  ENTITIES_CONFIG.BLOCK_SYNC_ERROR,
  ENTITIES_CONFIG.MISSED_BLOCK,
  ENTITIES_CONFIG.PROPOSAL,
  ENTITIES_CONFIG.VALIDATOR,
  ENTITIES_CONFIG.BLOCK,
  ENTITIES_CONFIG.DELEGATION,
  ENTITIES_CONFIG.DELEGATOR_REWARD,
  ENTITIES_CONFIG.HISTORY_PROPOSAL,
  ENTITIES_CONFIG.PROPOSAL_DEPOSIT,
  ENTITIES_CONFIG.PROPOSAL_VOTE,
  ENTITIES_CONFIG.SYNC_STATUS,
  ENTITIES_CONFIG.TRANSACTION,
  ENTITIES_CONFIG.SMART_CONTRACT,
  ENTITIES_CONFIG.TOKEN_CONTRACT,
];

@Module({
  imports: [
    ScheduleModule.register(),
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
    BullModule.forRootAsync({
      useFactory: async (_queueConfig = ENV_CONFIG.REDIS_CONFIG) => ({
        redis: {
          host: _queueConfig.HOST,
          port: _queueConfig.PORT,
          prefix: _queueConfig.PREFIX + '_BULL'
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: PROCESSOR_CONSTANTS.SYNC_BLOCK },
      { name: PROCESSOR_CONSTANTS.SYNC_MISSED_BLOCK },
      { name: PROCESSOR_CONSTANTS.BLOCK_SYNC_ERROR },
      { name: PROCESSOR_CONSTANTS.SYNC_VALIDATOR},
      { name: PROCESSOR_CONSTANTS.SYNC_PROPOSAL}
    ),
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
    {
      provide: REPOSITORY_INTERFACE.IBLOCK_REPOSITORY,
      useClass: BlockRepository,
    },
    {
      provide: REPOSITORY_INTERFACE.IDELEGATION_REPOSITORY,
      useClass: DelegationRepository,
    },
    {
      provide: REPOSITORY_INTERFACE.IDELEGATOR_REWARD_REPOSITORY,
      useClass: DelegatorRewardRepository,
    },
    {
      provide: REPOSITORY_INTERFACE.IHISTORY_PROPOSAL_REPOSITORY,
      useClass: HistoryProposalRepository,
    },
    {
      provide: REPOSITORY_INTERFACE.IPROPOSAL_DEPOSIT_REPOSITORY,
      useClass: ProposalDepositRepository,
    },
    {
      provide: REPOSITORY_INTERFACE.IPROPOSAL_VOTE_REPOSITORY,
      useClass: ProposalVoteRepository,
    },
    {
      provide: REPOSITORY_INTERFACE.ISYNC_STATUS_REPOSITORY,
      useClass: SyncStatusRepository,
    },
    {
      provide: REPOSITORY_INTERFACE.ITRANSACTION_REPOSITORY,
      useClass: TransactionRepository,
    },
    {
      provide: REPOSITORY_INTERFACE.ISMART_CONTRACT_REPOSITORY,
      useClass: SmartContractRepository,
    },
    {
      provide: REPOSITORY_INTERFACE.ITOKEN_CONTRACT_REPOSITORY,
      useClass: TokenContractRepository,
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
    {
      provide: SERVICE_INTERFACE.ISYNC_WEBSOCKET_SERVICE,
      useClass: SyncWebsocketService,
    },
    {
      provide: SERVICE_INTERFACE.ISYNC_STATUS_SERVICE,
      useClass: SyncStatusService,
    },
    {
      provide: SERVICE_INTERFACE.IBLOCK_SYNC_ERROR_SERVICE,
      useClass: BlockSyncErrorService,
    },

    // Queue
    SyncBlockConsumer,
    SyncMissedBlockConsumer,
    BlockSyncErrorConsumer,
    SyncValidatorConsumer,
    SyncProposalConsumer
  ],
})
export class AppModule { }
