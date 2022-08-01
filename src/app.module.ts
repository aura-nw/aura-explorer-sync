import { HttpModule } from '@nestjs/axios';
import { CacheModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from 'nest-schedule';
import { Block, BlockSyncError, Delegation, DelegatorReward, HistoryProposal, MissedBlock, Proposal, ProposalDeposit, ProposalVote, SmartContract, SmartContractCode, SyncStatus, TokenContract, Transaction, Validator } from './entities';
import { BlockSyncErrorRepository } from './repositories/block-sync-error.repository';
import { BlockRepository } from './repositories/block.repository';
import { DelegationRepository } from './repositories/delegation.repository';
import { DelegatorRewardRepository } from './repositories/delegator-reward.repository';
import { HistoryProposalRepository } from './repositories/history-proposal.repository';
import { MissedBlockRepository } from './repositories/missed-block.repository';
import { ProposalDepositRepository } from './repositories/proposal-deposit.repository';
import { ProposalVoteRepository } from './repositories/proposal-vote.repository';
import { ProposalRepository } from './repositories/proposal.repository';
import { SmartContractCodeRepository } from './repositories/smart-contract-code.repository';
import { SmartContractRepository } from './repositories/smart-contract.repository';
import { SyncStatusRepository } from './repositories/sync-status.repository';
import { TokenContractRepository } from './repositories/token-contract.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { ValidatorRepository } from './repositories/validator.repository';
import { SyncContractCodeService } from './services/sync-contract-code.service';
import { SyncProposalService } from './services/sync-proposal.service';
import { SyncTaskService } from './services/sync-task.service';
import { SyncTokenService } from './services/sync-token.service';
import { ConfigService } from './shared/services/config.service';
import { SharedModule } from './shared/shared.module';

const controllers = [];
const entities = [
  BlockSyncError,
  MissedBlock,
  Proposal,
  Validator,
  Block,
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
];

const repositories = [
  BlockSyncErrorRepository,
  MissedBlockRepository,
  ProposalRepository,
  ValidatorRepository,
  BlockRepository,
  DelegationRepository,
  DelegatorRewardRepository,
  HistoryProposalRepository,
  ProposalDepositRepository,
  ProposalVoteRepository,
  SyncStatusRepository,
  TransactionRepository,
  SmartContractRepository,
  TokenContractRepository,
  SmartContractCodeRepository
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
