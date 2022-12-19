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
import { SyncContractCodeService } from './services/sync-contract-code.service';
import { SyncTaskService } from './services/sync-task.service';
import { SyncTokenService } from './services/sync-token.service';
import { SyncTransactionService } from './services/sync-transaction.service';
import { ConfigService, ENV_CONFIG } from './shared/services/config.service';
import { SharedModule } from './shared/shared.module';
import { TokenMarketsRepository } from './repositories/token-markets.repository';
import { SoulboundTokenRepository } from './repositories/soulbound-token.repository';
import { SoulboundToken } from './entities/soulbound-token.entity';
import { SyncSmartContractService } from './services/sync-smart-contract.service';

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

const services = [
  SyncTaskService,
  SyncContractCodeService,
  SyncTokenService,
  SyncTransactionService,
  SyncSmartContractService,
];

const processors = [SmartContractsProcessor];

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
      // prefix: 'EXPLORER_SYNC',
      defaultJobOptions: {
        removeOnComplete: true,
      },
    }),
    BullModule.registerQueue({
      name: 'smart-contracts',
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
  exports: [BullModule, ...processors],
  controllers: [...controllers],
  providers: [...repositories, ...services, ...processors],
})
export class AppModule {}
