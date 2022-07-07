import { ResponseDto } from './dtos/responses';
import { Block, BlockSyncError, MissedBlock, Proposal, Transaction, Validator } from './entities';
import { Delegation } from './entities/delegation.entity';
import { DelegatorReward } from './entities/delegator-reward.entity';
import { HistoryProposal } from './entities/history-proposal.entity';
import { ProposalDeposit } from './entities/proposal-deposit.entity';
import { ProposalVote } from './entities/proposal-vote.entity';
import { SmartContractCode } from './entities/smart-contract-code.entity';
import { SmartContract } from './entities/smart-contract.entity';
import { SyncStatus } from './entities/sync-status.entity';
import { TokenContract } from './entities/token-contract.entity';

export const ENTITIES_CONFIG = {
  PROPOSAL: Proposal,
  VALIDATOR: Validator,
  MISSED_BLOCK: MissedBlock,
  BLOCK_SYNC_ERROR: BlockSyncError,
  BLOCK: Block,
  TRANSACTION: Transaction,
  DELEGATION: Delegation,
  DELEGATOR_REWARD: DelegatorReward,
  PROPOSAL_DEPOSIT: ProposalDeposit,
  HISTORY_PROPOSAL: HistoryProposal,
  PROPOSAL_VOTE: ProposalVote,
  SYNC_STATUS: SyncStatus,
  SMART_CONTRACT: SmartContract,
  TOKEN_CONTRACT: TokenContract,
  SMART_CONTRACT_CODE: SmartContractCode
};

export const RESPONSE_CONFIG = {
  RESPONSE_DTO: ResponseDto,
};

export module MODULE_REQUEST {
}

export module MODULE_RESPONSE {
  export abstract class ResponseDto extends RESPONSE_CONFIG.RESPONSE_DTO {}
}

export const SERVICE_INTERFACE = {
  ISYNC_PROPOSAL_SERVICE: 'ISyncProposalService',
  ISYNC_TASK_SERVICE: 'ISyncTaskService',
  ISYNC_WEBSOCKET_SERVICE: 'ISyncWebsocketService',
  ISYNC_CONTRACT_CODE_SERVICE: 'ISyncContractCodeService'
};

export const REPOSITORY_INTERFACE = {
  IVALIDATOR_REPOSITORY: 'IValidatorRepository',
  IPROPOSAL_REPOSITORY: 'IProposalRepository',
  IMISSED_BLOCK_REPOSITORY: 'IMissedBlockRepository',
  IBLOCK_SYNC_ERROR_REPOSITORY: 'IBlockSyncErrorRepository',
  IBLOCK_REPOSITORY: 'IBlockRepository',
  ITRANSACTION_REPOSITORY: 'ITransactionRepository',
  IDELEGATION_REPOSITORY: 'IDelegationRepository',
  IDELEGATOR_REWARD_REPOSITORY: 'IDelegatorRewardRepository',
  IHISTORY_PROPOSAL_REPOSITORY: 'IHistoryProposalRepository',
  IPROPOSAL_DEPOSIT_REPOSITORY: 'IProposalDepositRepository',
  IPROPOSAL_VOTE_REPOSITORY: 'IProposalVoteRepository',
  ISYNC_STATUS_REPOSITORY: 'ISyncStatusRepository',
  ISMART_CONTRACT_REPOSITORY: 'ISmartContractRepository',
  ITOKEN_CONTRACT_REPOSITORY: 'ITokenContractRepository',
  ISMART_CONTRACT_CODE_REPOSITORY: 'ISmartContractCodeRepository'
};

export const PROVIDER_INTERFACE = {};
