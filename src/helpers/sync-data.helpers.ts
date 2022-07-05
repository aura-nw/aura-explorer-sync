import { Injectable, Logger } from "@nestjs/common";
import { Block,Transaction } from "../entities";
import { APP_CONSTANTS, CONST_CHAR, CONST_DELEGATE_TYPE, CONST_MSG_TYPE, CONST_PROPOSAL_TYPE, CONST_PUBKEY_ADDR, MESSAGE_ACTION, NODE_API, SMART_CONTRACT_VERIFICATION } from "../common/constants/app.constant";
export class SyncDataHelpers {
    // constructor() {

    // }
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
    static makeTrxData(txData:any ,fetchingBlockHeight:number, txType:string,txRawLogData:string,time:any, txContractAddress:string){
        const newTx = new Transaction();
        const fee = txData.tx_response.tx.auth_info.fee.amount[0];
        const txFee = (fee) ? (fee[CONST_CHAR.AMOUNT] / APP_CONSTANTS.PRECISION_DIV).toFixed(6) : Number("0").toFixed(6);
        // newTx.blockId = savedBlock.id;
        newTx.code = txData.tx_response.code;
        newTx.codespace = txData.tx_response.codespace;
        newTx.data =
            txData.tx_response.code === 0 ? txData.tx_response.data : '';
        newTx.gas_used = txData.tx_response.gas_used;
        newTx.gas_wanted = txData.tx_response.gas_wanted;
        newTx.height = fetchingBlockHeight;
        newTx.info = txData.tx_response.info;
        newTx.raw_log = txData.tx_response.raw_log;
        newTx.raw_log_data = txRawLogData ?? null;
        // newTx.timestamp = blockData.block.header.time;
        newTx.timestamp = time;
        newTx.tx = JSON.stringify(txData.tx_response);
        newTx.tx_hash = txData.tx_response.txhash;
        newTx.type = txType;
        newTx.fee = txFee;
        newTx.messages = txData.tx_response.tx.body.messages;
        newTx.contract_address = txContractAddress;
        return newTx;
    }
    static makeTxRawLogData(txData:any){
        let txType = 'FAILED', txRawLogData, txContractAddress;
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
                let amount = txData.tx_response.logs[0].events.find(
                    ({ type }) => type === CONST_CHAR.WITHDRAW_REWARDS,
                );
                amount.attributes = amount.attributes.filter((x) => x.key == CONST_CHAR.AMOUNT);
                txRawLogData = JSON.stringify(amount);
            } else if (txMsgType == CONST_MSG_TYPE.MSG_DELEGATE || txMsgType == CONST_MSG_TYPE.MSG_REDELEGATE || txMsgType == CONST_MSG_TYPE.MSG_UNDELEGATE) {
                let amount = txData.tx_response.tx.body.messages[0].amount;
                let reward;
                try {
                    reward = txData.tx_response.logs[0].events.find(
                        ({ type }) => type === CONST_CHAR.TRANSFER,
                    ).attributes.filter((x) => x.key == CONST_CHAR.AMOUNT);
                } catch (error) {
                    reward = 0;
                }
                const rawData = {
                    amount,
                    reward
                };
                txRawLogData = JSON.stringify(rawData);
            } else if (txMsgType == CONST_MSG_TYPE.MSG_INSTANTIATE_CONTRACT) {
                let contract_address = txData.tx_response.logs[0].events.find(
                    ({ type }) => type === CONST_CHAR.INSTANTIATE,
                ).attributes.find(
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
        return [txType,txRawLogData,txContractAddress];
    }
}





