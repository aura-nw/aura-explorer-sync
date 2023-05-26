import {
  CONST_CHAR,
  CONST_DELEGATE_TYPE,
  CONTRACT_CODE_RESULT,
  CONTRACT_CODE_STATUS,
  CONTRACT_TYPE,
  MAINNET_UPLOAD_STATUS,
  SMART_CONTRACT_VERIFICATION,
  VALIDATOR_STATUSES,
} from '../common/constants/app.constant';
import {
  Block,
  TokenMarkets,
  ProposalVote,
  SmartContract,
  SmartContractCode,
  Validator,
} from '../entities';
import { ENV_CONFIG } from '../shared/services/config.service';
import { TokenCW20Dto } from '../dtos/token-cw20.dto';
export class SyncDataHelpers {
  private static precision = ENV_CONFIG.CHAIN_INFO.PRECISION_DIV;

  static makeBlockData(blockData: any) {
    const newBlock = new Block();
    newBlock.block_hash = blockData.hash;
    newBlock.chainid = blockData.data.block.header.chain_id;
    newBlock.height = blockData.height;
    newBlock.num_txs = blockData.transactions.length;
    newBlock.timestamp = blockData.time;
    newBlock.round = blockData.data.block.last_commit.round;
    newBlock.json_data = JSON.stringify(blockData);
    return newBlock;
  }

  static makeVoteData(txData, message: any) {
    const proposalVote = new ProposalVote();
    proposalVote.proposal_id = Number(message.proposal_id);
    proposalVote.voter = message.voter;
    proposalVote.tx_hash = txData.tx_response.txhash;
    proposalVote.option = message.option;
    proposalVote.created_at = new Date(txData.tx_response.timestamp);
    proposalVote.updated_at = new Date(txData.tx_response.timestamp);
    return proposalVote;
  }

  static makeValidatorData(data: any) {
    const newValidator = new Validator();
    newValidator.operator_address = data.operator_address;
    newValidator.acc_address = data.account_address;
    newValidator.cons_address = data.consensus_hex_address;
    newValidator.cons_pub_key = data.consensus_pubkey.key;
    newValidator.title = data.description.moniker;
    newValidator.jailed = data.jailed;
    newValidator.commission = Number(
      data.commission.commission_rates.rate,
    ).toFixed(4);
    newValidator.max_commission = data.commission.commission_rates.max_rate;
    newValidator.max_change_rate =
      data.commission.commission_rates.max_change_rate;
    newValidator.min_self_delegation = data.min_self_delegation;
    newValidator.delegator_shares = data.delegator_shares;
    newValidator.power = Number(data.tokens);
    newValidator.website = data.description.website;
    newValidator.details = data.description.details;
    newValidator.identity = data.description.identity;
    newValidator.unbonding_height = data.unbonding_height;
    newValidator.unbonding_time = new Date(data.unbonding_time);
    newValidator.update_time = new Date(data.commission.update_time);
    newValidator.status = Number(VALIDATOR_STATUSES[data.status]);
    newValidator.percent_power = data.percent_voting_power.toFixed(2);
    newValidator.up_time = String(data.uptime) + CONST_CHAR.PERCENT;
    newValidator.self_bonded = data.self_delegation_balance;
    newValidator.bonded_height = data.start_height || 1;

    return newValidator;
  }

  /**
   * Create TokenCW20 Dto
   * @param data
   * @returns
   */
  static makeTokenCW20Data(data: any): TokenCW20Dto {
    const tokenDto = new TokenCW20Dto();
    tokenDto.coinId = data.id;
    tokenDto.current_price = data.current_price;
    tokenDto.market_cap_rank = data.market_cap_rank;
    tokenDto.price_change_24h = data.price_change_24h;
    tokenDto.price_change_percentage_24h = data.price_change_percentage_24h;
    tokenDto.last_updated = data.last_updated;
    tokenDto.total_volume = data.total_volume;
    tokenDto.timestamp = data.last_updated;
    tokenDto.type = CONTRACT_TYPE.CW20;
    tokenDto.circulating_supply = data.circulating_supply;
    tokenDto.max_supply = Number(data.max_supply) || 0;
    tokenDto.current_holder = 0;
    tokenDto.percent_holder = 0;
    tokenDto.previous_holder = 0;
    return tokenDto;
  }

  static makeStoreCodeData(txData: any, message: any, index: number) {
    const smartContractCode = new SmartContractCode();
    const codeIds = txData.tx_response.logs[index]?.events
      .find((x) => x.type == CONST_CHAR.STORE_CODE)
      .attributes.filter((x) => x.key == CONST_CHAR.CODE_ID);
    smartContractCode.code_id = codeIds?.length > 0 ? codeIds[0].value : 0;
    smartContractCode.creator = message.sender;
    smartContractCode.tx_hash = txData.tx_response.txhash;

    return smartContractCode;
  }

  static updateTokenMarketsData(
    currentData: TokenMarkets,
    data: any,
  ): TokenMarkets {
    const coinInfo = { ...currentData };
    coinInfo.current_price = Number(data.current_price?.toFixed(6)) || 0;
    coinInfo.price_change_percentage_24h =
      Number(data.price_change_percentage_24h?.toFixed(6)) || 0;
    coinInfo.total_volume = Number(data.total_volume?.toFixed(6)) || 0;
    coinInfo.circulating_supply =
      Number(data.circulating_supply?.toFixed(6)) || 0;

    const circulating_market_cap =
      coinInfo.circulating_supply * coinInfo.current_price;
    coinInfo.circulating_market_cap =
      Number(circulating_market_cap?.toFixed(6)) || 0;
    coinInfo.max_supply = Number(data.max_supply?.toFixed(6)) || 0;
    coinInfo.market_cap = Number(data.market_cap?.toFixed(6)) || 0;
    coinInfo.fully_diluted_valuation =
      Number(data.fully_diluted_valuation?.toFixed(6)) || 0;

    return coinInfo;
  }

  static updateCoinMarketsData(
    currentData: TokenMarkets,
    data: any,
  ): TokenMarkets {
    const quote = data.quote?.USD;
    const coinInfo = { ...currentData };
    coinInfo.current_price = Number(quote?.price?.toFixed(6)) || 0;
    coinInfo.price_change_percentage_24h =
      Number(quote?.percent_change_24h?.toFixed(6)) || 0;
    coinInfo.total_volume = Number(quote?.volume_24h?.toFixed(6)) || 0;
    coinInfo.circulating_supply =
      Number(data.circulating_supply?.toFixed(6)) || 0;
    const circulating_market_cap =
      coinInfo.circulating_supply * coinInfo.current_price;
    coinInfo.circulating_market_cap =
      Number(circulating_market_cap?.toFixed(6)) || 0;
    coinInfo.max_supply = Number(data.max_supply?.toFixed(6)) || 0;
    coinInfo.market_cap =
      Number(data.self_reported_market_cap?.toFixed(6)) || 0;
    coinInfo.fully_diluted_valuation =
      Number(quote?.fully_diluted_market_cap?.toFixed(6)) || 0;

    return coinInfo;
  }

  /**
   * Create TokenMarkets entity
   * @param smartContract
   * @returns
   */
  static makeTokenMarket(smartContract: SmartContract) {
    const tokemMarket = new TokenMarkets();
    tokemMarket.contract_address = smartContract.contract_address || '';
    tokemMarket.code_id = smartContract.code_id;
    tokemMarket.coin_id = '';
    tokemMarket.symbol = smartContract.token_symbol || '';
    tokemMarket.image = smartContract.image || '';
    tokemMarket.name = smartContract.token_name || '';
    tokemMarket.description = smartContract.description || '';
    return tokemMarket;
  }

  /**
   * Create SmartContractCode entity
   * @param data
   * @returns
   */
  static makeSmartContractCode(data: any) {
    const smartContractCode = new SmartContractCode();
    const contractType = data.contract_type;
    const codeId = data?.code_id;
    smartContractCode.code_id = codeId?.id;
    smartContractCode.creator = codeId?.creator || '';
    smartContractCode.type = contractType.type;
    switch (contractType.status) {
      case CONTRACT_CODE_STATUS.COMPLETED:
        smartContractCode.result = CONTRACT_CODE_RESULT.CORRECT;
        break;
      case CONTRACT_CODE_STATUS.REJECTED:
        smartContractCode.result = CONTRACT_CODE_RESULT.INCORRECT;
        break;
      case CONTRACT_CODE_STATUS.TBD:
        smartContractCode.result = CONTRACT_CODE_RESULT.TBD;
        break;
      case CONTRACT_CODE_STATUS.WAITING:
        smartContractCode.result = CONTRACT_CODE_RESULT.TBD;
        break;
      default:
        smartContractCode.result = '';
        smartContractCode.type = '';
    }
    return smartContractCode;
  }

  static processEvent(txData: any) {
    const events = [];
    txData?.tx_response?.logs
      .filter((f) => f.events.length > 0)
      ?.forEach((item) => {
        events.push(...item.events);
      });
    return events;
  }

  static makeInstantiateContractData(contract: any) {
    const smartContract = new SmartContract();
    smartContract.id = 0;
    smartContract.height = contract.instantiate_height;
    smartContract.code_id = contract.code_id;
    smartContract.contract_name = contract.name || '';
    smartContract.contract_address = contract.address;
    smartContract.creator_address = contract.creator;
    smartContract.contract_hash = contract.contract_hash || '';
    smartContract.tx_hash = contract.instantiate_hash;
    smartContract.url = '';
    smartContract.instantiate_msg_schema = '';
    smartContract.query_msg_schema = '';
    smartContract.execute_msg_schema = '';
    smartContract.contract_match = '';
    smartContract.contract_verification =
      SMART_CONTRACT_VERIFICATION.UNVERIFIED;
    smartContract.compiler_version = '';
    smartContract.s3_location = '';
    smartContract.reference_code_id = 0;
    smartContract.mainnet_upload_status = MAINNET_UPLOAD_STATUS.UNVERIFIED;
    smartContract.verified_at = null;
    smartContract.project_name = '';
    smartContract.request_id = null;
    smartContract.token_name = '';
    smartContract.token_symbol = '';
    smartContract.decimals = 0;
    smartContract.description = '';
    smartContract.image = '';
    smartContract.num_tokens = Number(contract.num_tokens) || 0;
    // Set total transaction with default instantiate transaction.
    smartContract.total_tx = 1;

    const cw20Contract = contract.cw20_contract;
    if (cw20Contract) {
      smartContract.token_name = cw20Contract.name || '';
      smartContract.token_symbol = cw20Contract.symbol || '';
      smartContract.decimals = Number(cw20Contract.decimals);

      const cw20Marketing = cw20Contract.marketing_info;
      if (cw20Marketing) {
        smartContract.description = cw20Marketing.description || '';
        smartContract.image = cw20Contract.logo.url || '';
      }
    }

    const cw721Contract = contract.cw721_contract;
    if (cw721Contract) {
      smartContract.minter_address = cw721Contract.minter || '';
      smartContract.token_symbol = cw721Contract.symbol || '';
      smartContract.token_name = cw721Contract.name || '';
    }
    return smartContract;
  }
}
