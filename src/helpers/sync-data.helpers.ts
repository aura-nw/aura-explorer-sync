import { Nft } from '../entities/nft.entity';
import {
  CONST_CHAR,
  CONST_DELEGATE_TYPE,
  CONST_MSG_TYPE,
  CONST_PROPOSAL_TYPE,
  CONTRACT_TRANSACTION_EXECUTE_TYPE,
  CONTRACT_TYPE,
  SMART_CONTRACT_VERIFICATION,
} from '../common/constants/app.constant';
import {
  Block,
  Delegation,
  DelegatorReward,
  HistoryProposal,
  Proposal,
  ProposalDeposit,
  ProposalVote,
  SmartContract,
  TokenContract,
  Transaction,
  Validator,
} from '../entities';
import { ENV_CONFIG } from '../shared/services/config.service';
import { Cw20TokenOwner } from '../entities/cw20-token-owner.entity';
import { TokenCW20Dto } from '../dtos/token-cw20.dto';
import { TokenTransaction } from '../entities/token-transaction.entity';
import { find } from 'rxjs';
export class SyncDataHelpers {
  private static precision = ENV_CONFIG.CHAIN_INFO.PRECISION_DIV;
  private static toDecimal = ENV_CONFIG.CHAIN_INFO.COIN_DECIMALS;

  static makeBlockData(blockData: any) {
    const newBlock = new Block();
    newBlock.block_hash = blockData.block_id.hash;
    newBlock.chainid = blockData.block.header.chain_id;
    newBlock.height = blockData.block.header.height;
    newBlock.num_txs = blockData.block.data.txs.length;
    newBlock.timestamp = blockData.block.header.time;
    newBlock.round = blockData.block.last_commit.round;
    newBlock.json_data = JSON.stringify(blockData);
    return newBlock;
  }

  static makeTrxData(
    txData: any,
    fetchingBlockHeight: number,
    txType: string,
    txRawLogData: string,
    time: any,
    txContractAddress: string,
  ) {
    const newTx = new Transaction();
    const fee = txData.tx_response.tx.auth_info.fee.amount[0];
    const txFee = fee
      ? (fee[CONST_CHAR.AMOUNT] / this.precision).toFixed(this.toDecimal)
      : Number('0').toFixed(this.toDecimal);
    // newTx.blockId = savedBlock.id;
    newTx.code = txData.tx_response.code;
    newTx.codespace = txData.tx_response.codespace;
    newTx.data = txData.tx_response.code === 0 ? txData.tx_response.data : '';
    newTx.gas_used = txData.tx_response.gas_used;
    newTx.gas_wanted = txData.tx_response.gas_wanted;
    newTx.height = fetchingBlockHeight;
    newTx.info = txData.tx_response.info;
    newTx.raw_log = txData.tx_response.raw_log;
    newTx.raw_log_data = txRawLogData ?? null;
    newTx.timestamp = time;
    newTx.tx = JSON.stringify(txData.tx_response);
    newTx.tx_hash = txData.tx_response.txhash;
    newTx.type = txType;
    newTx.fee = txFee;
    newTx.messages = txData.tx_response.tx.body.messages;
    newTx.contract_address = txContractAddress;
    return newTx;
  }

  static makeTxRawLogData(txData: any) {
    let txType = 'FAILED',
      txRawLogData,
      txContractAddress;
    if (txData.tx_response.code === 0) {
      const txLog = JSON.parse(txData.tx_response.raw_log);

      const txAttr = txLog[0].events.find(
        ({ type }) => type === CONST_CHAR.MESSAGE,
      );
      const txAction = txAttr.attributes.find(
        ({ key }) => key === CONST_CHAR.ACTION,
      );
      const regex = /_/gi;
      txType = txAction.value.replace(regex, ' ');

      const txMsgType = txType.substring(txType.lastIndexOf('.') + 1);
      if (txMsgType == CONST_MSG_TYPE.MSG_WITHDRAW_DELEGATOR_REWARD) {
        const amount = txData.tx_response.logs[0].events.find(
          ({ type }) => type === CONST_CHAR.WITHDRAW_REWARDS,
        );
        amount.attributes = amount.attributes.filter(
          (x) => x.key == CONST_CHAR.AMOUNT,
        );
        txRawLogData = JSON.stringify(amount);
      } else if (
        txMsgType == CONST_MSG_TYPE.MSG_DELEGATE ||
        txMsgType == CONST_MSG_TYPE.MSG_REDELEGATE ||
        txMsgType == CONST_MSG_TYPE.MSG_UNDELEGATE
      ) {
        const amount = txData.tx_response.tx.body.messages[0].amount;
        let reward;
        try {
          reward = txData.tx_response.logs[0].events
            .find(({ type }) => type === CONST_CHAR.TRANSFER)
            .attributes.filter((x) => x.key == CONST_CHAR.AMOUNT);
        } catch (error) {
          reward = 0;
        }
        const rawData = {
          amount,
          reward,
        };
        txRawLogData = JSON.stringify(rawData);
      } else if (txMsgType == CONST_MSG_TYPE.MSG_INSTANTIATE_CONTRACT) {
        const contract_address = txData.tx_response.logs[0].events
          .find(({ type }) => type === CONST_CHAR.INSTANTIATE)
          .attributes.find(
            ({ key }) => key === CONST_CHAR._CONTRACT_ADDRESS,
          ).value;
        txContractAddress = contract_address;
      } else if (txMsgType == CONST_MSG_TYPE.MSG_EXECUTE_CONTRACT) {
        txContractAddress = txData.tx.body.messages[0].contract;
      }
    } else {
      const txBody = txData.tx_response.tx.body.messages[0];
      txType = txBody['@type'];
    }
    return [txType, txRawLogData, txContractAddress];
  }

  static makeRedelegationData(txData: any, message: any, index: number) {
    const delegation1 = new Delegation();
    delegation1.tx_hash = txData.tx_response.txhash;
    delegation1.delegator_address = message.delegator_address;
    delegation1.validator_address = message.validator_src_address;
    delegation1.amount = (Number(message.amount.amount) * -1) / this.precision;
    delegation1.created_at = new Date(txData.tx_response.timestamp);
    delegation1.type = CONST_DELEGATE_TYPE.REDELEGATE;
    const delegation2 = new Delegation();
    delegation2.tx_hash = txData.tx_response.txhash;
    delegation2.delegator_address = message.delegator_address;
    delegation2.validator_address = message.validator_dst_address;
    delegation2.amount = Number(message.amount.amount) / this.precision;
    delegation2.created_at = new Date(txData.tx_response.timestamp);
    delegation2.type = CONST_DELEGATE_TYPE.REDELEGATE;

    //save data to delegator_rewards table
    let amount1 = 0;
    let amount2 = 0;
    if (
      txData.tx_response.logs &&
      txData.tx_response.logs.length > 0 &&
      txData.tx_response.logs[index].events &&
      txData.tx_response.logs[index].events.length > 0
    ) {
      const events = txData.tx_response.logs[index].events;
      const claimEvent = events.find((i) => i.type === 'transfer');
      if (claimEvent) {
        const attributes = claimEvent.attributes;
        amount1 = Number(
          attributes[2].value.replace(
            ENV_CONFIG.CHAIN_INFO.COIN_MINIMAL_DENOM,
            '',
          ),
        );
        if (attributes.length > 3) {
          amount2 = Number(
            attributes[5].value.replace(
              ENV_CONFIG.CHAIN_INFO.COIN_MINIMAL_DENOM,
              '',
            ),
          );
        }
      }
    }
    const reward1 = new DelegatorReward();
    reward1.delegator_address = message.delegator_address;
    reward1.validator_address = message.validator_src_address;
    reward1.amount = amount1;
    reward1.tx_hash = txData.tx_response.txhash;
    const reward2 = new DelegatorReward();
    reward2.delegator_address = message.delegator_address;
    reward2.validator_address = message.validator_dst_address;
    reward2.amount = amount2;
    reward2.tx_hash = txData.tx_response.txhash;
    return [delegation1, delegation2, reward1, reward2];
  }

  static makeWithDrawDelegationData(txData: any, message: any, index: number) {
    const reward = new DelegatorReward();
    reward.delegator_address = message.delegator_address;
    reward.validator_address = message.validator_address;
    reward.amount = 0;
    if (
      txData.tx_response.logs &&
      txData.tx_response.logs.length > 0 &&
      txData.tx_response.logs[index].events &&
      txData.tx_response.logs[index].events.length > 0
    ) {
      const events = txData.tx_response.logs[index].events;
      const rewardEvent = events.find((i) => i.type === 'withdraw_rewards');
      const attributes = rewardEvent.attributes;
      const amount = attributes[0].value;
      reward.amount = Number(
        amount.replace(ENV_CONFIG.CHAIN_INFO.COIN_MINIMAL_DENOM, ''),
      );
    }
    reward.tx_hash = txData.tx_response.txhash;
    reward.created_at = new Date(txData.tx_response.timestamp);
    return reward;
  }

  static makeUndelegateData(txData: any, message: any, index: number) {
    const delegation = new Delegation();
    delegation.tx_hash = txData.tx_response.txhash;
    delegation.delegator_address = message.delegator_address;
    delegation.validator_address = message.validator_address;
    delegation.amount = (Number(message.amount.amount) * -1) / this.precision;
    delegation.created_at = new Date(txData.tx_response.timestamp);
    delegation.type = CONST_DELEGATE_TYPE.UNDELEGATE;
    //save data to delegator_rewards table
    const reward = new DelegatorReward();
    reward.delegator_address = message.delegator_address;
    reward.validator_address = message.validator_address;
    reward.amount = 0;
    if (
      txData.tx_response.logs &&
      txData.tx_response.logs.length > 0 &&
      txData.tx_response.logs[index].events &&
      txData.tx_response.logs[index].events.length > 0
    ) {
      const events = txData.tx_response.logs[index].events;
      const claimEvent = events.find((i) => i.type === 'transfer');
      if (claimEvent) {
        const attributes = claimEvent.attributes;
        reward.amount = Number(
          attributes[2].value.replace(
            ENV_CONFIG.CHAIN_INFO.COIN_MINIMAL_DENOM,
            '',
          ),
        );
        if (attributes.length > 3) {
          delegation.amount = (Number(
            attributes[5].value.replace(
              ENV_CONFIG.CHAIN_INFO.COIN_MINIMAL_DENOM,
              '',
            ),
          ) * -1) / this.precision;
        }
      }
    }
    reward.tx_hash = txData.tx_response.txhash;
    return [delegation, reward];
  }

  static makeDelegateData(txData: any, message: any, index: number) {
    const delegation = new Delegation();
    delegation.tx_hash = txData.tx_response.txhash;
    delegation.delegator_address = message.delegator_address;
    delegation.validator_address = message.validator_address;
    delegation.amount = Number(message.amount.amount) / this.precision;
    delegation.created_at = new Date(txData.tx_response.timestamp);
    delegation.type = CONST_DELEGATE_TYPE.DELEGATE;
    //save data to delegator_rewards table
    const reward = new DelegatorReward();
    reward.delegator_address = message.delegator_address;
    reward.validator_address = message.validator_address;
    reward.amount = 0;
    if (
      txData.tx_response.logs &&
      txData.tx_response.logs.length > 0 &&
      txData.tx_response.logs[index].events &&
      txData.tx_response.logs[index].events.length > 0
    ) {
      const events = txData.tx_response.logs[index].events;
      const claimEvent = events.find((i) => i.type === 'transfer');
      if (claimEvent) {
        const attributes = claimEvent.attributes;
        reward.amount = Number(
          attributes[2].value.replace(
            ENV_CONFIG.CHAIN_INFO.COIN_MINIMAL_DENOM,
            '',
          ),
        );
      }
    }
    reward.tx_hash = txData.tx_response.txhash;
    return [delegation, reward];
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

  static makeSubmitProposalData(txData: any, message: any, index: number) {
    const historyProposal = new HistoryProposal();
    let proposalDeposit = undefined;
    const proposalTypeReturn = message.content['@type'];
    const proposalType = proposalTypeReturn.substring(
      proposalTypeReturn.lastIndexOf('.') + 1,
    );
    historyProposal.proposal_id = 0;
    if (
      txData.tx_response.logs &&
      txData.tx_response.logs.length > 0 &&
      txData.tx_response.logs[index].events &&
      txData.tx_response.logs[index].events.length > 0
    ) {
      const events = txData.tx_response.logs[index].events;
      const submitEvent = events.find((i) => i.type === 'submit_proposal');
      const attributes = submitEvent.attributes;
      const findId = attributes.find((i) => i.key === 'proposal_id');
      historyProposal.proposal_id = Number(findId.value);
    }
    historyProposal.recipient = '';
    historyProposal.amount = 0;
    historyProposal.initial_deposit = 0;
    if (proposalType === CONST_PROPOSAL_TYPE.COMMUNITY_POOL_SPEND_PROPOSAL) {
      historyProposal.recipient = message.content.recipient;
      historyProposal.amount =
        message.content.amount.length > 0
          ? Number(message.content.amount[0].amount)
          : 0;
    } else {
      if (message.initial_deposit.length > 0) {
        historyProposal.initial_deposit = Number(
          message.initial_deposit[0].amount,
        );
        //save data to proposal deposit
        proposalDeposit = new ProposalDeposit();
        proposalDeposit.proposal_id = historyProposal.proposal_id;
        proposalDeposit.tx_hash = txData.tx_response.txhash;
        proposalDeposit.depositor = message.proposer;
        proposalDeposit.amount = Number(message.initial_deposit[0].amount);
        proposalDeposit.created_at = new Date(txData.tx_response.timestamp);
        // proposalDeposits.push(proposalDeposit);
      }
    }
    historyProposal.tx_hash = txData.tx_response.txhash;
    historyProposal.title = message.content.title;
    historyProposal.description = message.content.description;
    historyProposal.proposer = message.proposer;
    historyProposal.created_at = new Date(txData.tx_response.timestamp);
    return [historyProposal, proposalDeposit];
  }

  static makeDepositData(txData: any, message: any) {
    const proposalDeposit = new ProposalDeposit();
    proposalDeposit.proposal_id = Number(message.proposal_id);
    proposalDeposit.tx_hash = txData.tx_response.txhash;
    proposalDeposit.depositor = message.depositor;
    proposalDeposit.amount = Number(message.amount[0].amount);
    proposalDeposit.created_at = new Date(txData.tx_response.timestamp);
    return proposalDeposit;
  }

  static makeCreateValidatorData(txData: any, message: any) {
    const delegation = new Delegation();
    delegation.tx_hash = txData.tx_response.txhash;
    delegation.delegator_address = message.delegator_address;
    delegation.validator_address = message.validator_address;
    delegation.amount = Number(message.value.amount) / this.precision;
    delegation.created_at = new Date(txData.tx_response.timestamp);
    delegation.type = CONST_DELEGATE_TYPE.CREATE_VALIDATOR;
    return delegation;
  }

  static makeExecuteContractData(txData: any, _message: any) {
    const smartContracts = [];
    const tx_hash = txData.tx_response.txhash;
    const height = txData.tx_response.height;
    const contract_addresses = txData.tx_response.logs[0].events
      .find((x) => x.type == CONST_CHAR.INSTANTIATE)
      .attributes.filter((x) => x.key == CONST_CHAR._CONTRACT_ADDRESS);
    const code_ids = txData.tx_response.logs[0].events
      .find((x) => x.type == CONST_CHAR.INSTANTIATE)
      .attributes.filter((x) => x.key == CONST_CHAR.CODE_ID);
    contract_addresses.map(function (x, i) {
      const smartContract = new SmartContract();
      smartContract.code_id = code_ids[i].value;
      smartContract.contract_address = contract_addresses[i].value;
      smartContract.creator_address = txData.tx_response.logs[0].events
        .find((x) => x.type == CONST_CHAR.EXECUTE)
        .attributes.find((x) => x.key == CONST_CHAR._CONTRACT_ADDRESS).value;
      smartContract.tx_hash = tx_hash;
      smartContract.height = height;
      smartContract.contract_verification =
        SMART_CONTRACT_VERIFICATION.UNVERIFIED;
      smartContracts.push(smartContract);
    });
    return smartContracts;
  }

  static makeValidatorData(
    data: any,
    account_address: string,
    status: number,
    validatorAddr: string,
  ) {
    const newValidator = new Validator();
    newValidator.operator_address = data.operator_address;
    newValidator.acc_address = account_address;
    newValidator.cons_address = validatorAddr;
    newValidator.cons_pub_key = data.consensus_pubkey.key;
    newValidator.title = data.description.moniker;
    newValidator.jailed = data.jailed;
    newValidator.commission = Number(
      data.commission.commission_rates.rate,
    ).toFixed(2);
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
    newValidator.unbonding_time = data.unbonding_time;
    newValidator.update_time = data.commission.update_time;
    newValidator.status = status;

    return newValidator;
  }

  static makerProposalData(data: any, proposalTally: any) {
    const proposal = new Proposal();
    proposal.pro_id = Number(data.proposal_id);
    proposal.pro_title = data.content['title'];
    proposal.pro_description = data.content['description'];
    proposal.pro_status = data.status;
    proposal.pro_proposer_address = '';
    proposal.pro_proposer = '';
    proposal.pro_voting_start_time = new Date(data.voting_start_time);
    proposal.pro_voting_end_time = new Date(data.voting_end_time);
    proposal.pro_votes_yes = 0.0;
    proposal.pro_votes_abstain = 0.0;
    proposal.pro_votes_no = 0.0;
    proposal.pro_votes_no_with_veto = 0.0;

    proposal.pro_submit_time = new Date(data.submit_time);
    proposal.pro_total_deposits = 0.0;

    //set value for column not null
    proposal.pro_tx_hash = '';
    proposal.pro_type = data.content['@type'];
    proposal.pro_deposit_end_time = new Date(data.deposit_end_time);
    proposal.pro_activity = null;
    proposal.is_delete = false;
    if (proposalTally) {
      proposal.pro_votes_yes = proposalTally.tally.yes;
      proposal.pro_votes_abstain = proposalTally.tally.abstain;
      proposal.pro_votes_no = proposalTally.tally.no;
      proposal.pro_votes_no_with_veto = proposalTally.tally.no_with_veto;
    } else {
      proposal.pro_votes_yes = data.final_tally_result.yes;
      proposal.pro_votes_abstain = data.final_tally_result.abstain;
      proposal.pro_votes_no = data.final_tally_result.no;
      proposal.pro_votes_no_with_veto = data.final_tally_result.no_with_veto;
    }

    return proposal;
  }

  static makerCw20TokenData(item: any, marketingInfo: any, tokenInfo: any) {
    //sync data token
    const tokenContract = new TokenContract();
    tokenContract.type = CONTRACT_TYPE.CW20;
    tokenContract.contract_address = item.contract_address;
    tokenContract.created_at = new Date(item.createdAt);
    tokenContract.name = '';
    tokenContract.symbol = '';
    tokenContract.decimals = 0;
    if (item?.asset_info && item.asset_info?.data) {
      tokenContract.name = item.asset_info.data.name;
      tokenContract.symbol = item.asset_info.data.symbol;
      tokenContract.decimals = Number(item.asset_info.data.decimals);
    }
    tokenContract.description = '';
    tokenContract.image = '';
    if (marketingInfo?.data) {
      tokenContract.description = marketingInfo.data?.description ? marketingInfo.data.description : '';
      tokenContract.image = marketingInfo.data?.logo?.url ? marketingInfo.data.logo.url : '';
    }
    tokenContract.num_tokens = 0;
    tokenContract.coin_id = '';
    if (tokenInfo) {
      tokenContract.coin_id = tokenInfo.coinId;
      tokenContract.max_total_supply = tokenInfo.max_supply;
      tokenContract.price = tokenInfo.current_price;
      tokenContract.price_change_percentage_24h = tokenInfo.price_change_percentage_24h;
      tokenContract.volume_24h = tokenInfo.total_volume;
      tokenContract.circulating_market_cap = tokenInfo.current_price * tokenInfo.circulating_supply;
      tokenContract.fully_diluted_market_cap = tokenInfo.current_price * tokenInfo.max_supply;
      tokenContract.holders = tokenInfo.current_holder;
      tokenContract.holders_change_percentage_24h = tokenInfo.percent_holder;
    }
    //sync data token owner
    const cw20TokenOwner = new Cw20TokenOwner();
    cw20TokenOwner.contract_address = item.contract_address;
    cw20TokenOwner.owner = item.owner;
    cw20TokenOwner.balance = Number(item.balance);
    cw20TokenOwner.percent_hold = item.percent_hold;

    return [tokenContract, cw20TokenOwner];
  }

  static makerCw721TokenData(item: any, tokenInfo: any, numTokenInfo: any, tokens: any[]) {
    //sync data token
    const tokenContract = new TokenContract();
    tokenContract.type = CONTRACT_TYPE.CW721;
    tokenContract.image = '';
    tokenContract.description = '';
    tokenContract.contract_address = item.contract_address;
    tokenContract.decimals = 0;
    tokenContract.created_at = new Date(item.createdAt);
    tokenContract.name = '';
    tokenContract.symbol = '';
    if (tokenInfo?.data) {
      tokenContract.name = tokenInfo.data.name;
      tokenContract.symbol = tokenInfo.data.symbol;
    }
    tokenContract.num_tokens = 0;
    if (numTokenInfo?.data) {
      tokenContract.num_tokens = Number(numTokenInfo.data.count);
    }
    tokenContract.coin_id = '';
    //sync data nft
    const nft = new Nft();
    nft.contract_address = item.contract_address;
    nft.token_id = item.token_id;
    nft.created_at = new Date(item.createdAt);
    nft.updated_at = new Date(item.updatedAt);
    nft.uri_s3 = (item.media_info.length > 0 && item.media_info[0]?.media_link) ? item.media_info[0].media_link : '';
    nft.uri = '';
    nft.owner = '';
    if (item?.asset_info && item.asset_info?.data) {
      nft.uri = item.asset_info.data?.info?.token_uri ? item.asset_info.data.info.token_uri : '';
      nft.owner = item.asset_info.data?.access?.owner ? item.asset_info.data.access.owner : '';
    }
    //check is_burn
    const findItem = tokens.find((i) => (i.contract_address === item.contract_address && i.token_id === item.token_id));
    nft.is_burn = false;
    if (findItem) {
      nft.is_burn = findItem.is_burned;
    }
    if (nft.is_burn) {
      nft.owner = '';
    }

    return [tokenContract, nft];
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

  static makeTokenTransactionData(txData: any, _message: any) {
    const tokenTransaction = new TokenTransaction();
    tokenTransaction.tx_hash = txData.tx_response.txhash;
    tokenTransaction.height = txData.tx_response.height;
    tokenTransaction.contract_address = _message.contract;
    const transactionType = Object.keys(_message.msg)[0];
    tokenTransaction.transaction_type = transactionType;
    tokenTransaction.token_id = _message.msg[transactionType]?.token_id || '';
    tokenTransaction.sender = _message?.sender || '';
    tokenTransaction.amount = Number(_message.msg[transactionType]?.amount) || 0;
    tokenTransaction.from_address = _message?.sender || '';
    tokenTransaction.to_address = _message.msg[transactionType]?.owner || _message.msg[transactionType]?.recipient || '';
    if (transactionType === CONTRACT_TRANSACTION_EXECUTE_TYPE.MINT) {
      tokenTransaction.from_address = '';
    }
    if (transactionType === CONTRACT_TRANSACTION_EXECUTE_TYPE.BURN) {
      tokenTransaction.to_address = '';
    }

    return tokenTransaction;
  }
}
