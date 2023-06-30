import { CONST_CHAR, CONST_MSG_TYPE } from '../common/constants/app.constant';
import { TokenMarkets } from '../entities';
export class SyncDataHelpers {
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
}
