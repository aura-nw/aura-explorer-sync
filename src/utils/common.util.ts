import { HttpService } from "@nestjs/axios";
import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { lastValueFrom } from "rxjs";
import { tmhash } from 'tendermint/lib/hash';
import bech32 from 'bech32';
import { CONST_CHAR } from "src/common/constants/app.constant";
import { BlockSyncError } from "src/entities";
import { REPOSITORY_INTERFACE } from "src/module.config";
import { IBlockSyncErrorRepository } from "src/repositories/iblock-sync-error.repository";
import { ISyncStatusRepository } from "src/repositories/isync-status.repository";

@Injectable()
export class CommonUtil {
  constructor(
    private httpService: HttpService,
    @Inject(REPOSITORY_INTERFACE.IBLOCK_SYNC_ERROR_REPOSITORY)
    private blockSyncErrorRepository: IBlockSyncErrorRepository,
    @Inject(REPOSITORY_INTERFACE.ISYNC_STATUS_REPOSITORY)
    private statusRepository: ISyncStatusRepository,
  ) { }

  makeFileObjects(img) {
    // You can create File objects from a Buffer of binary data
    const buffer = Buffer.from(img.data, 'base64');
    return [
      new File(['contents-of-file-1'], 'plain-utf8.txt'),
      new File([buffer], img.name)
    ];
  }

  async getDataAPI(api, params) {
    const data = await lastValueFrom(this.httpService.get(api + params)).then(
      (rs) => rs.data,
    );

    return data;
  }

  getAddressFromPubkey(pubkey) {
    var bytes = Buffer.from(pubkey, 'base64');
    return tmhash(bytes).slice(0, 20).toString('hex').toUpperCase();
  }

  hexToBech32(address, prefix) {
    let addressBuffer = Buffer.from(address, 'hex');
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

  async insertBlockError(block_hash: string, height: number) {
    const blockSyncError = new BlockSyncError();
    blockSyncError.block_hash = block_hash;
    blockSyncError.height = height;
    await this.blockSyncErrorRepository.create(blockSyncError);
  }

  async updateStatus(newHeight) {
    const status = await this.statusRepository.findAll();
    status[0].current_block = newHeight;
    await this.statusRepository.create(status[0]);
  }
}
