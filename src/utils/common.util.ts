import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { tmhash } from 'tendermint/lib/hash';
import { bech32 } from 'bech32';
import {
  CONST_CHAR,
  CONTRACT_TYPE,
  NODE_API,
} from '../common/constants/app.constant';
import axios from 'axios';
import * as util from 'util';
import { SmartContract } from '../entities';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';

@Injectable()
export class CommonUtil {
  private readonly _logger = new Logger(CommonUtil.name);
  constructor(private httpService: HttpService) { }

  makeFileObjects(img) {
    // You can create File objects from a Buffer of binary data
    const buffer = Buffer.from(img.data, 'base64');
    return [
      new File(['contents-of-file-1'], 'plain-utf8.txt'),
      new File([buffer], img.name),
    ];
  }

  async getDataAPI(api, params) {
    return lastValueFrom(
      this.httpService.get(api + params, {
        timeout: 30000,
      }),
    ).then((rs) => rs.data);
  }

  async getDataService(api, params) {
    const data = await axios.get(api + params);

    return data;
  }

  getAddressFromPubkey(pubkey) {
    const bytes = Buffer.from(pubkey, 'base64');
    return tmhash(bytes).slice(0, 20).toString('hex').toUpperCase();
  }

  hexToBech32(address, prefix) {
    const addressBuffer = Buffer.from(address, 'hex');
    return bech32.encode(prefix, bech32.toWords(addressBuffer));
  }

  async getDataRPC(rpc, params) {
    const data = await lastValueFrom(this.httpService.get(rpc + params)).then(
      (rs) => rs.data,
    );

    if (typeof data.error != CONST_CHAR.UNDEFINED) {
      throw new InternalServerErrorException();
    }
    if (typeof data.result != CONST_CHAR.UNDEFINED) {
      return data.result;
    } else {
      return '';
    }
  }

  async postDataRPC(rpc, payload) {
    const data = await lastValueFrom(this.httpService.post(rpc, payload)).then(
      (rs) => rs.data,
    );

    if (typeof data.error != CONST_CHAR.UNDEFINED) {
      throw new InternalServerErrorException();
    }
    if (typeof data.result != CONST_CHAR.UNDEFINED) {
      return data.result;
    } else {
      return '';
    }
  }

  async getDataContractFromBase64Query(
    api: string,
    contract_address: string,
    base64String: string,
  ): Promise<any> {
    return lastValueFrom(
      this.httpService.get(
        api +
        `${util.format(
          NODE_API.CONTRACT_INFO,
          contract_address,
          base64String,
        )}`,
        {
          timeout: 30000,
        },
      ),
    ).then((rs) => rs.data);
  }

  async queryMoreInfoFromCosmwasm(
    api: string,
    contractAddress: string,
    smartContract: SmartContract,
    type: CONTRACT_TYPE,
  ): Promise<any> {
    try {
      const base64Encode = 'base64';
      if (type === CONTRACT_TYPE.CW20) {
        const tokenInfoQuery =
          Buffer.from(`{ "token_info": {} }`).toString(base64Encode);
        const marketingInfoQuery = Buffer.from(
          `{ "marketing_info": {} }`,
        ).toString(base64Encode);

        const [tokenInfo, marketingInfo] = await Promise.all([
          this.getDataContractFromBase64Query(
            api,
            contractAddress,
            tokenInfoQuery,
          ),
          this.getDataContractFromBase64Query(
            api,
            contractAddress,
            marketingInfoQuery,
          ),
        ]);
        if (marketingInfo?.data) {
          smartContract.image = marketingInfo.data?.logo?.url ?? '';
          smartContract.description = marketingInfo.data?.description ?? '';
        }
        if (tokenInfo?.data) {
          smartContract.token_name = tokenInfo.data.name;
          smartContract.token_symbol = tokenInfo.data.symbol;
        }
      } else {
        const base64RequestToken = Buffer.from(
          `{ "contract_info": {} }`,
        ).toString(base64Encode);

        const base64RequestNumToken =
          Buffer.from(`{ "num_tokens": {} }`).toString(base64Encode);

        const isCW4973 = (type === CONTRACT_TYPE.CW4973) ? true : false;
        const base64Minter = Buffer.from(`{ "minter": {} }`).toString(base64Encode);

        const [tokenInfo, numTokenInfo, minter] = await Promise.all([
          this.getDataContractFromBase64Query(
            api,
            contractAddress,
            base64RequestToken,
          ),
          this.getDataContractFromBase64Query(
            api,
            contractAddress,
            base64RequestNumToken,
          ),
          (isCW4973) ?
            this.getDataContractFromBase64Query(
              api,
              contractAddress,
              base64Minter,
            ) : null
        ]);

        if (tokenInfo?.data) {
          smartContract.token_name = tokenInfo.data.name;
          smartContract.token_symbol = tokenInfo.data.symbol;
        }
        if (numTokenInfo?.data) {
          smartContract.num_tokens = Number(numTokenInfo.data.count);
        }
        if(minter?.data){
          smartContract.minter_address = minter?.data?.minter;
        }
      }

      return smartContract;
    } catch (err) {
      this._logger.log(
        `${CommonUtil.name} call ${this.queryMoreInfoFromCosmwasm.name} method has error: ${err.message}`,
        err.stack,
      );
      return smartContract;
    }
  }
}
