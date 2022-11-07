import {
  IBC_TRANSACTIONS,
  MODE_EXECUTE_TRANSACTION,
  TRANSACTION_ATTRIBUTE,
  TRANSACTION_EVENT,
  TRANSACTION_TYPE,
} from 'src/common/constants/transaction-type.enum';
import { CONST_CHAR } from '../common/constants/app.constant';
import { SyncTransaction } from '../entities';
import { ENV_CONFIG } from '../shared/services/config.service';

export class TransactionHelper {
  private static precision = ENV_CONFIG.CHAIN_INFO.PRECISION_DIV;
  private static toDecimal = ENV_CONFIG.CHAIN_INFO.COIN_DECIMALS;
  private static minimalDenom = ENV_CONFIG.CHAIN_INFO.COIN_MINIMAL_DENOM;

  static decode(b64Encoded: string) {
    return Buffer.from(b64Encoded, 'base64').toString();
  }

  static formatAmount(amount: number) {
    return (amount / TransactionHelper.precision).toFixed(
      TransactionHelper.toDecimal,
    );
  }

  static getAmount(messages: any[], events: any[], type: TRANSACTION_TYPE) {
    const ibcTransfer = messages.find((m) =>
      m['@type'].includes(TRANSACTION_TYPE.IBC_TRANSFER),
    );
    if (messages.length > 1 && IBC_TRANSACTIONS.includes(type) && ibcTransfer) {
      return TransactionHelper.formatAmount(ibcTransfer.token.amount);
    }

    const message = messages[0];

    const delegateTypes = [
      TRANSACTION_TYPE.UNDELEGATE,
      TRANSACTION_TYPE.DELEGATE,
      TRANSACTION_TYPE.REDELEGATE,
    ];
    if (message?.amount && delegateTypes.includes(type)) {
      return TransactionHelper.formatAmount(message?.amount.amount || 0);
    }

    if (type === TRANSACTION_TYPE.SUBMIT_PROPOSAL) {
      const amount =
        message?.initial_deposit?.[0]?.amount ||
        message?.content?.amount?.[0]?.amount ||
        message?.amount?.[0]?.amount ||
        0;

      return TransactionHelper.formatAmount(amount);
    }

    if (type === TRANSACTION_TYPE.CREATE_VALIDATOR) {
      return TransactionHelper.formatAmount(message?.value?.amount || 0);
    }

    if (type === TRANSACTION_TYPE.GET_REWARD) {
      let total = 0;
      events
        .filter((e) => e.type === TRANSACTION_EVENT.WITHDRAW_REWARDS)
        .forEach((e) => {
          const _amount = e.attributes.find(
            (k) => k.key === TRANSACTION_ATTRIBUTE.AMOUNT,
          );
          const amount = _amount
            ? TransactionHelper.decode(_amount.value)?.replace(
                TransactionHelper.minimalDenom,
                '',
              )
            : 0;
          total += Number(amount);
        });

      return TransactionHelper.formatAmount(total);
    }

    if (type === TRANSACTION_TYPE.MULTI_SEND) {
      let total = 0;
      messages.forEach((m) => {
        const amount = m.coins?.[0]?.amount || 0;
        total += Number(amount);
      });

      return TransactionHelper.formatAmount(total);
    }

    if (message?.amount) {
      return TransactionHelper.formatAmount(message?.amount?.[0]?.amount || 0);
    }

    if (message?.funds && message?.funds.length > 0) {
      return TransactionHelper.formatAmount(message?.funds?.[0]?.amount || 0);
    }
  }

  static getTransactionType(messages: any[]): TRANSACTION_TYPE | undefined {
    if (!messages || messages.length === 0) return;
    const types = messages.map((m) =>
      m['@type'].substring(m['@type'].lastIndexOf('.') + 1),
    );

    const txType = types[0];

    if (messages.length > 1 && IBC_TRANSACTIONS.includes(txType)) {
      return types.find((type) => type !== TRANSACTION_TYPE.IBC_UPDATE_CLIENT);
    }

    return txType;
  }

  static makeSyncTransaction(transaction: any) {
    const messages = transaction.tx_response.tx.body.messages;
    const events = transaction.tx_response.events;

    const newTx = new SyncTransaction();
    const fee = transaction.tx_response.tx.auth_info.fee.amount[0];
    const txFee = fee
      ? TransactionHelper.formatAmount(fee[CONST_CHAR.AMOUNT])
      : Number('0').toFixed(TransactionHelper.toDecimal);
    const type = TransactionHelper.getTransactionType(messages);
    const { fromAddress, toAddress, contractAddress } =
      TransactionHelper.getDataInfo(messages, events);

    // set values
    newTx.tx_hash = transaction.tx_response.txhash;
    newTx.type = type;
    newTx.contract_address = contractAddress;
    newTx.from_address = fromAddress;
    newTx.to_address = toAddress;
    newTx.amount = TransactionHelper.getAmount(messages, events, type);
    newTx.fee = txFee;
    newTx.timestamp = transaction.tx_response.timestamp;
    return newTx;
  }

  static getDataInfo(messages, events) {
    const message = messages[0];
    let fromAddress = '',
      toAddress = '',
      contractAddress = '';

    const type = TransactionHelper.getTransactionType(messages);
    switch (type) {
      case TRANSACTION_TYPE.INSTANTIATE_CONTRACT: {
        fromAddress = message.sender;
        toAddress =
          message.msg?.minter ||
          message.contract_address ||
          message.msg?.initial_balances?.[0]?.address ||
          message.msg?.mint?.minter;
        const _contractAddress = events
          .find((e) => e.type === TRANSACTION_EVENT.INSTANTIATE)
          ?.attributes?.find(
            (a) => a.key === TRANSACTION_ATTRIBUTE.CONTRACT_ADDRESS,
          );
        contractAddress = _contractAddress
          ? TransactionHelper.decode(_contractAddress.value)
          : '';
        break;
      }
      case TRANSACTION_TYPE.EXECUTE_CONTRACT:
        const method = Object.keys(message.msg)?.[0];
        fromAddress = message.sender;
        toAddress =
          message.msg[Object.keys(message.msg)?.[0]]?.recipient ||
          message.msg[Object.keys(message.msg)?.[0]]?.owner ||
          message.msg[Object.keys(message.msg)?.[0]]?.spender ||
          message.msg[Object.keys(message.msg)?.[0]]?.operator;
        if (method === MODE_EXECUTE_TRANSACTION.BURN) {
          toAddress = '';
        }
        if (method === MODE_EXECUTE_TRANSACTION.MINT) {
          fromAddress = '';
        }
        contractAddress = message.contract;
        break;
      case TRANSACTION_TYPE.DELEGATE:
        fromAddress = message.delegator_address;
        toAddress = message.validator_address;
        break;
      case TRANSACTION_TYPE.GET_REWARD:
        fromAddress = message.validator_address;
        toAddress = message.delegator_address;
        break;
      case TRANSACTION_TYPE.STORE_CODE: {
        fromAddress = message.sender;

        const recipient = events
          .find((e) => e.type === TRANSACTION_EVENT.TRANSFER)
          ?.attributes?.find((a) => a.key === TRANSACTION_ATTRIBUTE.RECIPIENT);
        toAddress = recipient ? TransactionHelper.decode(recipient.value) : '';
        contractAddress = toAddress;
        break;
      }
      case TRANSACTION_TYPE.DEPOSIT: {
        fromAddress = message.depositor;
        const recipient = events
          .find((e) => e.type === TRANSACTION_EVENT.TRANSFER)
          ?.attributes?.find((a) => a.key === TRANSACTION_ATTRIBUTE.RECIPIENT);
        toAddress = recipient ? TransactionHelper.decode(recipient.value) : '';
        contractAddress = toAddress;
        break;
      }
      case TRANSACTION_TYPE.SUBMIT_PROPOSAL:
        fromAddress = message.proposer;
        toAddress = message?.content.recipient;
        break;
      case TRANSACTION_TYPE.REDELEGATE:
        fromAddress = message.delegator_address;
        toAddress = message.validator_dst_address;
        break;
      case TRANSACTION_TYPE.UNDELEGATE:
        fromAddress = message.validator_address;
        toAddress = message.delegator_address;
        break;
      case TRANSACTION_TYPE.VOTE:
        fromAddress = message.voter;
        toAddress = message.delegator_address;
        break;
      default:
        fromAddress = message.from_address;
        toAddress = message.to_address;
        break;
    }
    return { fromAddress, toAddress, contractAddress };
  }
}
