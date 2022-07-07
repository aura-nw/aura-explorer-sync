export enum APP_CONSTANTS {
  PRECISION_DIV = 1000000
}

export enum ORDER_BY {
  DESC = 'DESC',
  ASC = 'ASC',
}
export enum DATABASE_TYPE {
  POSTGRES = 'postgres',
  MYSQL = 'mysql',
}

export enum MESSAGE_ACTION {
  MSG_SEND = '/cosmos.bank.v1beta1.MsgSend',
  MSG_INSTANTIATE_CONTRACT = '/cosmwasm.wasm.v1.MsgInstantiateContract',
  MSG_EXECUTE_CONTRACT = '/cosmwasm.wasm.v1.MsgExecuteContract',
  MSG_MIGRATE_CONTRACT = '/cosmwasm.wasm.v1.MsgMigrateContract',
  MSG_STORE_CODE = '/cosmwasm.wasm.v1.MsgStoreCode',
}

export enum NODE_API {
  PROPOSALS = `cosmos/gov/v1beta1/proposals?pagination.reverse=true`,
  STAKING_POOL = `cosmos/staking/v1beta1/pool`,
  INFLATION = `cosmos/mint/v1beta1/inflation`,
  COMMUNITY_POOL = `cosmos/distribution/v1beta1/community_pool`,
  VALIDATOR = `cosmos/staking/v1beta1/validators`,
  SLASHING_PARAM = `cosmos/slashing/v1beta1/params`,
  SIGNING_INFOS = `cosmos/slashing/v1beta1/signing_infos`,
  LATEST_BLOCK = `blocks/latest`,
}

export enum CONST_PUBKEY_ADDR {
  AURAVALCONS = 'auravalcons',
  AURA = 'aura',
}

export enum CONST_CHAR {
  PERCENT = '%',
  SECOND = 's',
  UAURA  = 'uaura',
  DELEGATE  = 'delegate',
  REDELEGATE = 'redelegate',
  UNBOND = 'unbond',
  VALIDATOR = 'validator',
  AMOUNT = 'amount',
  UNDEFINED = 'undefined',
  MESSAGE = 'message',
  ACTION = 'action',
  WITHDRAW_REWARDS = 'withdraw_rewards',
  TRANSFER = 'transfer',
  SOURCE_VALIDATOR = 'source_validator',
  INSTANTIATE = 'instantiate',
  _CONTRACT_ADDRESS = '_contract_address',
  CODE_ID = 'code_id',
  EXECUTE = 'execute',
}

export enum CONST_MSG_TYPE {
  MSG_VOTE = 'MsgVote',
  MSG_SUBMIT_PROPOSAL = 'MsgSubmitProposal',
  MSG_DEPOSIT = 'MsgDeposit',
  MSG_DELEGATE = 'MsgDelegate',
  MSG_UNDELEGATE = 'MsgUndelegate',
  MSG_REDELEGATE = 'MsgBeginRedelegate',
  MSG_WITHDRAW_DELEGATOR_REWARD = 'MsgWithdrawDelegatorReward',
  MSG_INSTANTIATE_CONTRACT = 'MsgInstantiateContract',
  MSG_EXECUTE_CONTRACT = 'MsgExecuteContract',
  MSG_CREATE_VALIDATOR = 'MsgCreateValidator'
}

export enum CONST_PROPOSAL_TYPE {
  SOFTWARE_UPGRADE_PROPOSAL = 'SoftwareUpgradeProposal',
  COMMUNITY_POOL_SPEND_PROPOSAL = 'CommunityPoolSpendProposal',
  PARAMETER_CHANGE_PROPOSAL = 'ParameterChangeProposal'
}

export enum CONST_DELEGATE_TYPE {
  DELEGATE = 'Delegate',
  UNDELEGATE = 'Undelegate',
  REDELEGATE = 'Redelegate',
  CREATE_VALIDATOR = 'CreateValidator'
}

export enum CONST_PROPOSAL_STATUS {
  PROPOSAL_STATUS_UNSPECIFIED = 'PROPOSAL_STATUS_UNSPECIFIED',
  PROPOSAL_STATUS_DEPOSIT_PERIOD = 'PROPOSAL_STATUS_DEPOSIT_PERIOD',
  PROPOSAL_STATUS_VOTING_PERIOD = 'PROPOSAL_STATUS_VOTING_PERIOD',
  PROPOSAL_STATUS_PASSED = 'PROPOSAL_STATUS_PASSED',
  PROPOSAL_STATUS_REJECTED = 'PROPOSAL_STATUS_REJECTED',
  PROPOSAL_STATUS_FAILED = 'PROPOSAL_STATUS_FAILED'
}

export enum SMART_CONTRACT_VERIFICATION {
  UNVERIFIED = 'UNVERIFIED',
  EXACT_MATCH = 'EXACT MATCH',
  SIMILAR_MATCH = 'SIMILAR MATCH',
}

export enum CONTRACT_TYPE {
  CW20 = "CW20",
  CW721 = "CW721"
}

export enum CONTRACT_CODE_RESULT {
  TBD = "TBD",
  CORRECT = "Correct",
  INCORRECT = "Incorrect"
}

export enum CONTRACT_CODE_STATUS {
  TBD = "TBD",
  WAITING = "WAITING",
  COMPLETED = "COMPLETED",
  REJECTED = "REJECTED"
}

export enum INDEXER_API {
  CHECK_STATUS_CODE_ID = "api/v1/codeid/%s/checkStatus"
}
