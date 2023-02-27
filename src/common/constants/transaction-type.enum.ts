export enum TRANSACTION_TYPE {
  IBC_TRANSFER = 'MsgTransfer',
  IBC_RECEIVED = 'MsgRecvPacket',
  IBC_ACKNOWLEDGEMENT = 'MsgAcknowledgement',
  IBC_UPDATE_CLIENT = 'MsgUpdateClient',
  IBC_TIMEOUT = 'MsgTimeout',
  IBC_CHANNEL_OPEN_INIT = 'MsgChannelOpenInit',
  IBC_CONNECTION_OPEN_INIT = 'MsgConnectionOpenInit',
  IBC_CREATE_CLIENT = 'MsgCreateClient',
  IBC_CHANNEL_OPEN_ACK = 'MsgChannelOpenAck',

  SEND = 'MsgSend',
  MULTI_SEND = 'MsgMultiSend',
  DELEGATE = 'MsgDelegate',
  UNDELEGATE = 'MsgUndelegate',
  REDELEGATE = 'MsgBeginRedelegate',
  GET_REWARD = 'MsgWithdrawDelegatorReward',
  SWAP_WITHIN_BATCH = 'MsgSwapWithinBatch',
  DEPOSIT_WITHIN_BATCH = 'MsgDepositWithinBatch',
  EDIT_VALIDATOR = 'MsgEditValidator',
  CREATE_VALIDATOR = 'MsgCreateValidator',
  JAILED = 'MsgJailed',
  UNJAIL = 'MsgUnjail',
  STORE_CODE = 'MsgStoreCode',
  INSTANTIATE_CONTRACT = 'MsgInstantiateContract',
  EXECUTE_CONTRACT = 'MsgExecuteContract',
  MODIFY_WITHDRAW_ADDRESS = 'MsgSetWithdrawAddress',
  JOIN_POOL = 'MsgJoinPool',
  LOCK_TOKENS = 'MsgLockTokens',
  JOIN_SWAP_EXTERN_AMOUNT_IN = 'MsgJoinSwapExternAmountIn',
  SWAP_EXACT_AMOUNT_IN = 'MsgSwapExactAmountIn',
  BEGIN_UNLOCKING = 'MsgBeginUnlocking',
  VOTE = 'MsgVote',
  CREATE_VESTING_ACCOUNT = 'MsgCreateVestingAccount',
  DEPOSIT = 'MsgDeposit',
  SUBMIT_PROPOSAL = 'MsgSubmitProposal',
  WITHDRAW_VALIDATOR_COMMISSION = 'MsgWithdrawValidatorCommission',
}

export const IBC_TRANSACTIONS = [
  TRANSACTION_TYPE.IBC_TRANSFER,
  TRANSACTION_TYPE.IBC_RECEIVED,
  TRANSACTION_TYPE.IBC_ACKNOWLEDGEMENT,
  TRANSACTION_TYPE.IBC_UPDATE_CLIENT,
  TRANSACTION_TYPE.IBC_TIMEOUT,
  TRANSACTION_TYPE.IBC_CHANNEL_OPEN_INIT,
  TRANSACTION_TYPE.IBC_CONNECTION_OPEN_INIT,
  TRANSACTION_TYPE.IBC_CREATE_CLIENT,
  TRANSACTION_TYPE.IBC_CHANNEL_OPEN_ACK,
];

export enum MODE_EXECUTE_TRANSACTION {
  DEFAULT = 'default',
  MINT = 'mint',
  BURN = 'burn',
  BUY = 'buy',
}

export enum TRANSACTION_EVENT {
  TRANSFER = 'transfer',
  INSTANTIATE = 'instantiate',
  WITHDRAW_REWARDS = 'withdraw_rewards',
}

export enum TRANSACTION_ATTRIBUTE {
  AMOUNT = 'YW1vdW50',
  RECIPIENT = 'cmVjaXBpZW50',
  CONTRACT_ADDRESS = 'X2NvbnRyYWN0X2FkZHJlc3M=',
}
