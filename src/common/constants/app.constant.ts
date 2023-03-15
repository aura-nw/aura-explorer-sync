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
  CONTRACT_INFO = `cosmwasm/wasm/v1/contract/%s/smart/%s`,
  CONTRACT_CODE = `cosmwasm/wasm/v1/code?pagination.key=%s`,
  CONTRACT_CODE_DETAIL = `cosmwasm/wasm/v1/code/%s`,
}

export enum CONST_PUBKEY_ADDR {
  AURAVALCONS = 'auravalcons',
  AURA = 'aura',
}

export enum CONST_CHAR {
  PERCENT = '%',
  SECOND = 's',
  DELEGATE = 'delegate',
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
  WASM = 'wasm',
  LIQUIDITY_TOKEN_ADDR = 'liquidity_token_addr',
  STORE_CODE = 'store_code',
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
  MSG_CREATE_VALIDATOR = 'MsgCreateValidator',
  MSG_STORE_CODE = 'MsgStoreCode',
}

export enum CONST_PROPOSAL_TYPE {
  SOFTWARE_UPGRADE_PROPOSAL = 'SoftwareUpgradeProposal',
  COMMUNITY_POOL_SPEND_PROPOSAL = 'CommunityPoolSpendProposal',
  PARAMETER_CHANGE_PROPOSAL = 'ParameterChangeProposal',
}

export enum CONST_DELEGATE_TYPE {
  DELEGATE = 'Delegate',
  UNDELEGATE = 'Undelegate',
  REDELEGATE = 'Redelegate',
  CREATE_VALIDATOR = 'CreateValidator',
}

export enum CONST_PROPOSAL_STATUS {
  PROPOSAL_STATUS_UNSPECIFIED = 'PROPOSAL_STATUS_UNSPECIFIED',
  PROPOSAL_STATUS_DEPOSIT_PERIOD = 'PROPOSAL_STATUS_DEPOSIT_PERIOD',
  PROPOSAL_STATUS_VOTING_PERIOD = 'PROPOSAL_STATUS_VOTING_PERIOD',
  PROPOSAL_STATUS_PASSED = 'PROPOSAL_STATUS_PASSED',
  PROPOSAL_STATUS_REJECTED = 'PROPOSAL_STATUS_REJECTED',
  PROPOSAL_STATUS_FAILED = 'PROPOSAL_STATUS_FAILED',
}

export enum SMART_CONTRACT_VERIFICATION {
  UNVERIFIED = 'UNVERIFIED',
  VERIFIED = 'VERIFIED',
}

export enum CONTRACT_TYPE {
  CW20 = 'CW20',
  CW721 = 'CW721',
  CW4973 = 'CW4973',
}

export enum CONTRACT_CODE_RESULT {
  TBD = 'TBD',
  CORRECT = 'Correct',
  INCORRECT = 'Incorrect',
}

export enum CONTRACT_CODE_STATUS {
  TBD = 'TBD',
  WAITING = 'WAITING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  NOT_FOUND = 'NotFound',
}

export enum INDEXER_API {
  CHECK_STATUS_CODE_ID = 'api/v1/codeid/%s/%s/checkStatus',
  GET_LIST_TOKENS = 'api/v1/asset/getByContractType?contractType=%s&chainid=%s&pageLimit=100&pageOffset=0&countTotal=true',
  GET_HOLDER_TOKEN = 'api/v1/asset/holder?chainid=%s&contractType=CW20&contractAddress=%s&countTotal=true',
  TRANSACTION = 'api/v1/transaction?chainid=%s&pageLimit=%s&fromHeight=%s&reverse=true',
  GET_HOLDER_INFO_CW20 = 'api/v1/daily-cw20-holder',
  GET_SMART_CONTRACTS = 'api/v1/smart-contracts?chainId=%s&limit=%s&fromHeight=%s&toHeight=%s',
  GET_SMART_CONTRACT_BY_NEXT_KEY = 'api/v1/smart-contracts?chainId=%s&limit=%s&nextKey=%s',
  GET_SMART_CONTRACT_BT_CONTRACT_ADDRESS = 'api/v1/smart-contracts?chainId=%s&contract_addresses[]=%s',
  GET_SMART_CONTRACT_BT_LIST_CONTRACT_ADDRESS = 'api/v1/smart-contracts?chainId=%s',
}

export enum COINGECKO_API {
  GET_PRICE_VOLUME = 'simple/price?ids=%s&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true',
  GET_COINS_MARKET = 'coins/markets?vs_currency=usd&ids=%s&order=market_cap_desc&per_page=%s&page=1&sparkline=false&price_change_percentage=24h',
  GET_COINS = 'coins/list?include_platform=true',
}

export enum AURA_INFO {
  TYPE = 'AURA',
  IMAGE = 'https://nft-ipfs.s3.amazonaws.com/assets/imgs/icons/color/aura.svg',
  CONNTRACT_ADDRESS = 'aura',
  COIN_ID = 'aura-network',
}

export enum CONTRACT_TRANSACTION_EXECUTE_TYPE {
  MINT = 'mint',
  BURN = 'burn',
  APPROVE = 'approve',
  REVOKE = 'revoke',
  TRANSFER_NFT = 'transfer_nft',
}

export enum KEYWORD_SEARCH_TRANSACTION {
  MINT_CONTRACT_CW721 = '%"mint"%"token_id"%',
}

export enum MAINNET_UPLOAD_STATUS {
  UNVERIFIED = 'Unverified',
  NOT_REGISTERED = 'Not registered',
  TBD = 'TBD',
  DEPLOYED = 'Deployed',
  REJECTED = 'Rejected',
}

export enum REDIS_KEY {
  COINGECKO_COINS = 'COINGECKO_COINS',
}

export enum SOULBOUND_TOKEN_STATUS {
  UNCLAIM = 'Unclaimed',
  EQUIPPED = 'Equipped',
  UNEQUIPPED = 'Unequipped',
}

export const SOULBOUND_PICKED_TOKEN = {
  MIN: 0,
  MAX: 5,
};

export const QUEUES_PROCESSOR = {
  SMART_CONTRACTS: 'smart-contracts',
  VALIDATOR: 'validator',
};

export const QUEUES_STATUS = {
  PENDING: 'PENDING',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
};

export const QUEUES = {
  SYNC_EXECUTE_CONTRACTS: 'sync-execute-contracts',
  SYNC_CW4973_NFT_STATUS: 'sync-cw4973-nft-status',
  SYNC_INSTANTIATE_CONTRACTS: 'sync-instantiate-contracts',
  SYNC_PRICE_VOLUME: 'sync-price-volume',
  SYNC_COIN_ID: 'sync-coin-id',
  SYNC_CONTRACT_FROM_HEIGHT: 'sync-contract-from-height',
  SYNC_VALIDATOR: 'sync-validator',
  SYNC_CONTRACT_CODE: 'sync-contract-code',
};

export enum CW4973_CONTRACT {
  AGREEMENT = 'Agreement(string chain_id,address active,address passive,string tokenURI)',
}
