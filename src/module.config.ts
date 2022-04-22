import { ResponseDto } from './dtos/responses';
import { Block, BlockSyncError, MissedBlock, Proposal, Transaction, Validator } from './entities';

export const ENTITIES_CONFIG = {
  PROPOSAL: Proposal,
  VALIDATOR: Validator,
  MISSED_BLOCK: MissedBlock,
  BLOCK_SYNC_ERROR: BlockSyncError,
  BLOCK: Block,
  TRANSACTION: Transaction,
};

export const REQUEST_CONFIG = {
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
};

export const REPOSITORY_INTERFACE = {
  IVALIDATOR_REPOSITORY: 'IValidatorRepository',
  IPROPOSAL_REPOSITORY: 'IProposalRepository',
  IMISSED_BLOCK_REPOSITORY: 'IMissedBlockRepository',
  IBLOCK_SYNC_ERROR_REPOSITORY: 'IBlockSyncErrorRepository',
  IBLOCK_REPOSITORY: 'IBlockRepository',
  ITRANSACTION_REPOSITORY: 'ITransactionRepository',
};

export const PROVIDER_INTERFACE = {};
