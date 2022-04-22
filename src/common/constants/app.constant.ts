export enum AppConstants {}

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
  PROPOSALS = `/cosmos/gov/v1beta1/proposals`,
  STAKING_POOL = `/cosmos/staking/v1beta1/pool`,
  INFLATION = `/cosmos/mint/v1beta1/inflation`,
  COMMUNITY_POOL = `/cosmos/distribution/v1beta1/community_pool`,
  VALIDATOR = `/cosmos/staking/v1beta1/validators`,
  SLASHING_PARAM = `/cosmos/slashing/v1beta1/params`,
  SIGNING_INFOS = `/cosmos/slashing/v1beta1/signing_infos`,
  LATEST_BLOCK = `/blocks/latest`,
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
  UNBOND = 'unbond',
  VALIDATOR = 'validator',
  AMOUNT = 'amount',
  UNDEFINED = 'undefined',
  MESSAGE = 'message',
  ACTION = 'action',
}

export enum CONST_MSG_TYPE {
  MSG_VOTE = 'MsgVote',
  MSG_SUBMIT_PROPOSAL = 'MsgSubmitProposal',
  MSG_DEPOSIT = 'MsgDeposit',
  MSG_DELEGATE = 'MsgDelegate',
  MSG_UNDELEGATE = 'MsgUndelegate',
  MSG_REDELEGATE = 'MsgBeginRedelegate',
  MSG_WITHDRAW_DELEGATOR_REWARD = 'MsgWithdrawDelegatorReward'
}

export enum CONST_PROPOSAL_TYPE {
  SOFTWARE_UPGRADE_PROPOSAL = 'SoftwareUpgradeProposal',
  COMMUNITY_POOL_SPEND_PROPOSAL = 'CommunityPoolSpendProposal',
  PARAMETER_CHANGE_PROPOSAL = 'ParameterChangeProposal'
}

export enum CONST_DELEGATE_TYPE {
  DELEGATE = 'Delegate',
  UNDELEGATE = 'Undelegate',
  REDELEGATE = 'Redelegate'
}
