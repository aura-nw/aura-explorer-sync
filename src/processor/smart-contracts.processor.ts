import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueError,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import {
  SOULBOUND_TOKEN_STATUS,
  SOULBOUND_PICKED_TOKEN,
  QUEUES,
  PROCESSOR,
} from '../common/constants/app.constant';
import { ConfigService } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';

import { HttpService } from '@nestjs/axios';
import { In } from 'typeorm';
import { SoulboundTokenRepository } from '../repositories/soulbound-token.repository';
import { SoulboundToken } from '../entities/soulbound-token.entity';
import { lastValueFrom, timeout, retry } from 'rxjs';

@Processor(PROCESSOR.SMART_CONTRACT)
export class SmartContractsProcessor {
  private readonly logger = new Logger(SmartContractsProcessor.name);
  private indexerChainId;

  constructor(
    private _commonUtil: CommonUtil,
    private configService: ConfigService,
    private httpService: HttpService,
    private soulboundTokenRepos: SoulboundTokenRepository,
  ) {
    this.logger.log(
      '============== Constructor Smart Contracts Processor Service ==============',
    );
    this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');
  }

  @Process(QUEUES.SYNC_CW4973_NFT_STATUS)
  async handleSyncCw4973NftStatus(job: Job) {
    this.logger.log(
      `============== Queue handleSyncCw4973NftStatus was run! ==============`,
    );
    try {
      const takeContracts: any = job.data.takeMessage;
      const unequipContracts: any = job.data.unequipMessage;
      const takes = takeContracts?.msg?.take?.signature.signature;
      const unequips = unequipContracts?.msg?.unequip?.token_id;
      const contractAddress = job.data.contractAddress;
      const tokenUri = takeContracts?.msg?.take?.uri;
      const receiverAddress = job.data.receiverAddress;

      if (takeContracts) {
        const tokenId = this._commonUtil.createTokenId(
          this.indexerChainId,
          receiverAddress,
          takeContracts?.msg?.take?.from,
          tokenUri,
        );

        const newSBTToken = await this.soulboundTokenRepos.findOne({
          where: { contract_address: contractAddress, token_id: tokenId },
        });

        if (!newSBTToken) {
          const entity = new SoulboundToken();
          const ipfs = await lastValueFrom(
            this.httpService
              .get(this._commonUtil.transform(tokenUri))
              .pipe(timeout(8000), retry(5)),
          )
            .then((rs) => rs.data)
            .catch(() => {
              return null;
            });

          let contentType;
          const imgUrl = !!ipfs?.animation_url
            ? ipfs?.animation_url
            : ipfs?.image;
          if (imgUrl) {
            contentType = await lastValueFrom(
              this.httpService
                .get(this._commonUtil.transform(imgUrl))
                .pipe(timeout(18000), retry(5)),
            )
              .then((rs) => rs?.headers['content-type'])
              .catch(() => {
                return null;
              });
          }

          entity.contract_address = contractAddress;
          entity.receiver_address = receiverAddress;
          entity.token_uri = tokenUri;
          entity.signature = takeContracts?.msg?.take?.signature.signature;
          entity.pub_key = takeContracts?.msg?.take?.signature.pub_key;
          entity.token_img = ipfs?.image;
          entity.token_name = ipfs?.name;
          entity.img_type = contentType;
          entity.animation_url = ipfs?.animation_url;
          entity.token_id = tokenId;
          try {
            await this.soulboundTokenRepos.insert(entity);
          } catch (err) {
            this.logger.error(`sync-cw4973-nft-status has error: ${err.stack}`);
          }
        }
      }

      const soulboundTokens = await this.soulboundTokenRepos.find({
        where: [
          { signature: takes, contract_address: contractAddress },
          { token_id: unequips, contract_address: contractAddress },
        ],
      });
      if (soulboundTokens) {
        const receiverAddress = soulboundTokens.map((m) => m.receiver_address);
        const soulboundTokenInfos = await this.soulboundTokenRepos.find({
          where: {
            receiver_address: In(receiverAddress),
          },
        });
        soulboundTokens.forEach((item) => {
          let token;
          if (
            item.signature === takeContracts?.msg?.take?.signature.signature
          ) {
            token = takeContracts;
          }

          if (item.token_id === unequipContracts?.msg?.unequip?.token_id) {
            token = unequipContracts;
          }

          if (token?.msg?.take) {
            const numOfTokens = soulboundTokenInfos?.filter(
              (f) =>
                f.receiver_address === item.receiver_address &&
                (f.status === SOULBOUND_TOKEN_STATUS.EQUIPPED ||
                  f.status === SOULBOUND_TOKEN_STATUS.UNEQUIPPED),
            );
            if (
              numOfTokens?.length < SOULBOUND_PICKED_TOKEN.MAX &&
              item.status === SOULBOUND_TOKEN_STATUS.UNCLAIM
            ) {
              item.picked = true;
            }
            item.status = SOULBOUND_TOKEN_STATUS.EQUIPPED;
          } else {
            item.status = SOULBOUND_TOKEN_STATUS.UNEQUIPPED;
            item.picked = false;
          }
        });
        this.soulboundTokenRepos.update(soulboundTokens);
      }
      this.logger.log(
        `sync-cw4973-nft-status update complete: ${JSON.stringify(
          soulboundTokens,
        )}`,
      );
    } catch (err) {
      this.logger.error(`sync-cw4973-nft-status has error: ${err.stack}`);
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id} of type ${job.name}...`);
  }

  @OnQueueCompleted()
  async onComplete(job: Job, result: any) {
    this.logger.log(`Completed job ${job.id} of type ${job.name}`);
    this.logger.log(`Result: ${result}`);
  }

  @OnQueueError()
  onError(job: Job, error: Error) {
    this.logger.error(`Job: ${job}`);
    this.logger.error(`Error job ${job.id} of type ${job.name}`);
    this.logger.error(`Error: ${error}`);
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}`);
    this.logger.error(`Error: ${error}`);
  }
}
