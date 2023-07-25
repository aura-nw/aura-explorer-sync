export enum DATABASE_TYPE {
  POSTGRES = 'postgres',
  MYSQL = 'mysql',
}

export enum NODE_API {
  PROPOSALS = `cosmos/gov/v1beta1/proposals?pagination.reverse=true`,
  STAKING_POOL = `cosmos/staking/v1beta1/pool`,
  INFLATION = `cosmos/mint/v1beta1/inflation`,
  COMMUNITY_POOL = `cosmos/distribution/v1beta1/community_pool`,
  VALIDATOR = `cosmos/staking/v1beta1/validators`,
  LIST_VALIDATOR = `cosmos/staking/v1beta1/validators?pagination.key=%s`,
  SLASHING_PARAM = `cosmos/slashing/v1beta1/params`,
  SIGNING_INFOS = `cosmos/slashing/v1beta1/signing_infos`,
  LIST_SIGNING_INFOS = `cosmos/slashing/v1beta1/signing_infos?pagination.key=%s`,
  LATEST_BLOCK = `cosmos/base/tendermint/v1beta1/blocks/latest`,
  CONTRACT_INFO = `cosmwasm/wasm/v1/contract/%s/smart/%s`,
  CONTRACT_CODE = `cosmwasm/wasm/v1/code?pagination.key=%s`,
  CONTRACT_CODE_DETAIL = `cosmwasm/wasm/v1/code/%s`,
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

export enum CONTRACT_TYPE {
  CW20 = 'CW20',
  CW721 = 'CW721',
  CW4973 = 'CW4973',
}

export enum COINGECKO_API {
  GET_PRICE_VOLUME = 'simple/price?ids=%s&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true',
  GET_COINS_MARKET = 'coins/markets?vs_currency=usd&ids=%s&order=market_cap_desc&per_page=%s&page=1&sparkline=false&price_change_percentage=24h',
  GET_COINS = 'coins/list?include_platform=true',
}

export enum COIN_MARKET_CAP_API {
  GET_COINS_MARKET = 'cryptocurrency/quotes/latest?slug=%s',
}

export enum GECKOTERMINAL_API {
  GET_AURA_PRICE = '/networks/bsc/pools/0x9f1a332c0657ce3f90666ad38dbe2e92793abf5c',
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

export const QUEUES = {
  SYNC_CW4973_NFT_STATUS: 'sync-cw4973-nft-status',
  SYNC_PRICE_VOLUME: 'sync-price-volume',
  SYNC_COIN_ID: 'sync-coin-id',
  SYNC_AURA_TOKEN: 'sync-aura-token',
};

export enum CW4973_CONTRACT {
  AGREEMENT = 'Agreement(string chain_id,address active,address passive,string tokenURI)',
}

export enum PROCESSOR {
  SMART_CONTRACT = 'smart-contracts',
  TOKEN_PRICE = 'token-price',
}
