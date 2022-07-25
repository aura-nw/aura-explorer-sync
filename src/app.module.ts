import { HttpModule } from '@nestjs/axios';
import { CacheModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from 'nest-schedule';
import {
  ENTITIES_CONFIG
} from './module.config';
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
import { ConfigService } from './shared/services/config.service';
import { SharedModule } from './shared/shared.module';

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
  ENTITIES_CONFIG.SMART_CONTRACT_CODE,
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
