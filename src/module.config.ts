import {
  Block,
  BlockSyncError,
  MissedBlock,
  Proposal,
  Transaction,
  Validator,
} from './entities';
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
  SMART_CONTRACT_CODE: SmartContractCode,
}
