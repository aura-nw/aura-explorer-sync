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
  CW4973_CONTRACT,
  NODE_API,
} from '../common/constants/app.constant';
import axios from 'axios';
import * as util from 'util';
import { SmartContract } from '../entities';
import { sha256 } from 'js-sha256';
import { ENV_CONFIG } from '../shared/services/config.service';

@Injectable()
export class CommonUtil {
  private readonly _logger = new Logger(CommonUtil.name);
  constructor(private httpService: HttpService) {}

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

  async getDataAPIWithHeader(api, params, headersRequest) {
    return lastValueFrom(
      this.httpService.get(api + params, {
        timeout: 30000,
        headers: headersRequest,
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

  async queryNumTokenInfo(api: string, contractAddress: string): Promise<any> {
    const base64Encode = 'base64';
    const base64RequestNumToken =
      Buffer.from(`{ "num_tokens": {} }`).toString(base64Encode);

    const numTokenInfo = await this.getDataContractFromBase64Query(
      api,
      contractAddress,
      base64RequestNumToken,
    );

    if (numTokenInfo?.data) {
      return Number(numTokenInfo.data.count);
    }

    return null;
  }

  async queryMoreInfoFromCosmwasm(
    api: string,
    contractAddress: string,
    smartContract: SmartContract,
    type: CONTRACT_TYPE,
  ): Promise<any> {
    try {
      const base64Encode = 'base64';
      const updatedSmartContract = { ...smartContract };
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
          updatedSmartContract.image = marketingInfo.data?.logo?.url ?? '';
          updatedSmartContract.description =
            marketingInfo.data?.description ?? '';
        }
        if (tokenInfo?.data) {
          updatedSmartContract.token_name = tokenInfo.data.name;
          updatedSmartContract.token_symbol = tokenInfo.data.symbol;
          updatedSmartContract.decimals = tokenInfo.data.decimals || 0;
        }
      } else {
        const base64RequestToken = Buffer.from(
          `{ "contract_info": {} }`,
        ).toString(base64Encode);

        const base64Minter =
          Buffer.from(`{ "minter": {} }`).toString(base64Encode);

        const [tokenInfo, minter] = await Promise.all([
          this.getDataContractFromBase64Query(
            api,
            contractAddress,
            base64RequestToken,
          ),
          type === CONTRACT_TYPE.CW4973
            ? this.getDataContractFromBase64Query(
                api,
                contractAddress,
                base64Minter,
              )
            : null,
        ]);

        if (tokenInfo?.data) {
          updatedSmartContract.token_name = tokenInfo.data.name;
          updatedSmartContract.token_symbol = tokenInfo.data.symbol;
        }
        if (minter?.data) {
          smartContract.minter_address = minter.data.minter;
        }
      }

      return updatedSmartContract;
    } catch (err) {
      this._logger.log(
        `${CommonUtil.name} call ${this.queryMoreInfoFromCosmwasm.name} method has error: ${err.message}`,
        err.stack,
      );
      return null;
    }
  }

  /**
   * Create token Id
   * @param chainID
   * @param active
   * @param passive
   * @param uri
   * @returns
   */
  createTokenId(
    chainID: string,
    active: string,
    passive: string,
    uri: string,
  ): string {
    try {
      const message: string = this.createMessageToSign(
        chainID,
        active,
        passive,
        uri,
      );
      return sha256(message);
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * Create message sign
   * @param chainID
   * @param active
   * @param passive
   * @param uri
   * @returns
   */
  private createMessageToSign(
    chainID: string,
    active: string,
    passive: string,
    uri: string,
  ) {
    const message =
      CW4973_CONTRACT.AGREEMENT + chainID + active + passive + uri;
    const doc: any = {
      account_number: '0',
      chain_id: '',
      fee: {
        amount: [],
        gas: '0',
      },
      memo: '',
      msgs: [
        {
          type: 'sign/MsgSignData',
          value: {
            data: Buffer.from(message, 'utf8').toString('base64'),
            signer: String(passive),
          },
        },
      ],
      sequence: '0',
    };
    return JSON.stringify(doc);
  }

  transform(value: string): string {
    if (!value.includes('https://ipfs.io/')) {
      return 'https://ipfs.io/' + value.replace('://', '/');
    } else {
      return value;
    }
  }

  async getImageFromKeyBase(suffix: string): Promise<string> {
    const keyBaseUrl = `user/lookup.json?key_suffix=${suffix}&fields=pictures`;
    const respones = await this.getDataAPI(ENV_CONFIG.KEY_BASE_URL, keyBaseUrl);
    if (respones?.them?.length > 0) {
      const primary = respones.them[0]?.pictures?.primary;
      return primary?.url || '';
    }
    return '';
  }
}
