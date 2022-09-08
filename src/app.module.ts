import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { CacheModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from 'nest-schedule';
import { Block, BlockSyncError, Delegation, DelegatorReward, HistoryProposal, MissedBlock, Proposal, ProposalDeposit, ProposalVote, SmartContract, SmartContractCode, SyncStatus, TokenContract, Transaction, Validator } from './entities';
import { Cw20TokenOwner } from './entities/cw20-token-owner.entity';
import { DeploymentRequests } from './entities/deployment-requests.entity';
import { TokenTransaction } from './entities/token-transaction.entity';
import { BlockSyncErrorRepository } from './repositories/block-sync-error.repository';
import { BlockRepository } from './repositories/block.repository';
import { Cw20TokenOwnerRepository } from './repositories/cw20-token-owner.repository';
import { DelegationRepository } from './repositories/delegation.repository';
import { DelegatorRewardRepository } from './repositories/delegator-reward.repository';
import { DeploymentRequestsRepository } from './repositories/deployment-requests.repository';
import { HistoryProposalRepository } from './repositories/history-proposal.repository';
import { MissedBlockRepository } from './repositories/missed-block.repository';
import { ProposalDepositRepository } from './repositories/proposal-deposit.repository';
import { ProposalVoteRepository } from './repositories/proposal-vote.repository';
import { ProposalRepository } from './repositories/proposal.repository';
import { SmartContractCodeRepository } from './repositories/smart-contract-code.repository';
import { SmartContractRepository } from './repositories/smart-contract.repository';
import { SyncStatusRepository } from './repositories/sync-status.repository';
import { TokenContractRepository } from './repositories/token-contract.repository';
import { TokenTransactionRepository } from './repositories/token-transaction.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { ValidatorRepository } from './repositories/validator.repository';
import { SyncContractCodeService } from './services/sync-contract-code.service';
import { SyncProposalService } from './services/sync-proposal.service';
import { SyncTaskService } from './services/sync-task.service';
import { SyncTokenService } from './services/sync-token.service';
import { ConfigService, ENV_CONFIG } from './shared/services/config.service';
import { SharedModule } from './shared/shared.module';

const controllers = [];
const entities = [
  BlockSyncError,
  MissedBlock,
  Proposal,
  Validator,
  Block,
  DeploymentRequests,
  Delegation,
  DelegatorReward,
  HistoryProposal,
  ProposalDeposit,
  ProposalVote,
  SyncStatus,
  Transaction,
  SmartContract,
  TokenContract,
  SmartContractCode,
  Cw20TokenOwner,
  TokenTransaction
];

const repositories = [
  BlockSyncErrorRepository,
  MissedBlockRepository,
  ProposalRepository,
  ValidatorRepository,
  BlockRepository,
  DeploymentRequestsRepository,
  DelegationRepository,
  DelegatorRewardRepository,
  HistoryProposalRepository,
  ProposalDepositRepository,
  ProposalVoteRepository,
  SyncStatusRepository,
  TransactionRepository,
  SmartContractRepository,
  TokenContractRepository,
  SmartContractCodeRepository,
  Cw20TokenOwnerRepository,
  TokenTransactionRepository
];

const services = [
  SyncProposalService,
  SyncTaskService,
  SyncContractCodeService,
  SyncTokenService
]
@Module({
  imports: [
    ScheduleModule.register(),
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
    // BullModule.forRoot({
    //   redis: {
    //     host: ENV_CONFIG.REDIS.HOST,
    //     port: ENV_CONFIG.REDIS.PORT,
    //     keyPrefix: 'EXPLORER_SYNC'
    //   }
    // }),
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
    ...repositories,
    ...services
  ],
})
export class AppModule { }
