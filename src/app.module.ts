import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { CacheModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from 'nest-schedule';
import { SmartContractsProcessor } from './processor/smart-contracts.processor';
import {
  Block,
  BlockSyncError,
  TokenMarkets,
  Delegation,
  DelegatorReward,
  MissedBlock,
  ProposalVote,
  SmartContract,
  SmartContractCode,
  SyncStatus,
  Transaction,
  Validator,
} from './entities';
import { Cw20TokenOwner } from './entities/cw20-token-owner.entity';
import { DeploymentRequests } from './entities/deployment-requests.entity';
import { BlockSyncErrorRepository } from './repositories/block-sync-error.repository';
import { BlockRepository } from './repositories/block.repository';
import { Cw20TokenOwnerRepository } from './repositories/cw20-token-owner.repository';
import { DelegationRepository } from './repositories/delegation.repository';
import { DelegatorRewardRepository } from './repositories/delegator-reward.repository';
import { DeploymentRequestsRepository } from './repositories/deployment-requests.repository';
import { MissedBlockRepository } from './repositories/missed-block.repository';
import { ProposalVoteRepository } from './repositories/proposal-vote.repository';
import { SmartContractCodeRepository } from './repositories/smart-contract-code.repository';
import { SmartContractRepository } from './repositories/smart-contract.repository';
import { SyncStatusRepository } from './repositories/sync-status.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { ValidatorRepository } from './repositories/validator.repository';
import { ConfigService, ENV_CONFIG } from './shared/services/config.service';
import { SharedModule } from './shared/shared.module';
import { TokenMarketsRepository } from './repositories/token-markets.repository';
import { SoulboundTokenRepository } from './repositories/soulbound-token.repository';
import { SoulboundToken } from './entities/soulbound-token.entity';
import { ValidatorProcessor } from './processor/validator.processor';
import { QUEUES } from './common/constants/app.constant';
import { CoinProcessor } from './processor/coin.processor';
import { BlockProcessor } from './processor/block.processor';
import { ReSyncSmartContractProcessor } from './processor/resync/resync-smart-contract.processor';
import { TransactionProcessor } from './processor/transaction.processor';

const controllers = [];
const entities = [
  BlockSyncError,
  MissedBlock,
  Validator,
  Block,
  DeploymentRequests,
  Delegation,
  DelegatorReward,
  ProposalVote,
  SyncStatus,
  SmartContract,
  SmartContractCode,
  Cw20TokenOwner,
  TokenMarkets,
  Transaction,
  SoulboundToken,
];

const repositories = [
  BlockSyncErrorRepository,
  MissedBlockRepository,
  ValidatorRepository,
  BlockRepository,
  DeploymentRequestsRepository,
  DelegationRepository,
  DelegatorRewardRepository,
  ProposalVoteRepository,
  SyncStatusRepository,
  SmartContractRepository,
  SmartContractCodeRepository,
  Cw20TokenOwnerRepository,
  TokenMarketsRepository,
  TransactionRepository,
  SoulboundTokenRepository,
];

const processors = [
  SmartContractsProcessor,
  ValidatorProcessor,
  CoinProcessor,
  BlockProcessor,
  ReSyncSmartContractProcessor,
  TransactionProcessor,
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
    BullModule.forRoot({
      redis: {
        host: ENV_CONFIG.REDIS.HOST,
        port: ENV_CONFIG.REDIS.PORT,
        username: ENV_CONFIG.REDIS.USERNAME,
        db: parseInt(ENV_CONFIG.REDIS.DB, 10),
      },
      prefix: ENV_CONFIG.REDIS.PREFIX,
      defaultJobOptions: {
        removeOnComplete: 100,
      },
    }),
    BullModule.registerQueue(
      {
        name: QUEUES.SYNC_CONTRACT.QUEUE_NAME,
      },
      {
        name: QUEUES.RESYNC.CONTRACT.QUEUE_NAME,
      },
      {
        name: 'validator',
      },
      {
        name: QUEUES.SYNC_COIN.QUEUE_NAME,
      },
      {
        name: QUEUES.SYNC_BLOCK.QUEUE_NAME,
      },
      {
        name: 'transaction',
      },
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
  exports: [BullModule, ...processors],
  controllers: [...controllers],
  providers: [...repositories, ...processors],
})
export class AppModule {}
