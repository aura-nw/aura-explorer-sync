import {
  InjectQueue,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueError,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import * as util from 'util';
import {
  CONTRACT_CODE_RESULT,
  CONTRACT_TYPE,
  INDEXER_API,
  SOULBOUND_TOKEN_STATUS,
  SOULBOUND_PICKED_TOKEN,
  QUEUES,
  INDEXER_V2_API,
  LIMIT_NUMBS,
} from '../common/constants/app.constant';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import { ConfigService, ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';

import { HttpService } from '@nestjs/axios';
import { In } from 'typeorm';
import { SoulboundTokenRepository } from '../repositories/soulbound-token.repository';
import { SoulboundToken } from '../entities/soulbound-token.entity';
import { lastValueFrom, timeout, retry } from 'rxjs';
import { CronExpression } from '@nestjs/schedule';

@Processor(QUEUES.SYNC_CONTRACT.QUEUE_NAME)
export class SmartContractsProcessor {
  private readonly logger = new Logger(SmartContractsProcessor.name);
  private indexerUrl;
  private indexerChainId;

  constructor(
    private _commonUtil: CommonUtil,
    private smartContractRepository: SmartContractRepository,
    private tokenMarketsRepository: TokenMarketsRepository,
    private httpService: HttpService,
    private soulboundTokenRepos: SoulboundTokenRepository,
    private configService: ConfigService,
    @InjectQueue(QUEUES.SYNC_CONTRACT.QUEUE_NAME)
    private readonly contractQueue: Queue,
  ) {
    this.logger.log(
      '============== Constructor Smart Contracts Processor Service ==============',
    );
    this.indexerUrl = this.configService.get('INDEXER_URL');
    this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');

    this.contractQueue.add(
      QUEUES.SYNC_CONTRACT.JOBS.SYNC_INSTANTIATE_CONTRACTS,
      {},
      {
        removeOnFail: false,
        repeat: { cron: CronExpression.EVERY_5_SECONDS },
      },
    );
  }

  @Process(QUEUES.SYNC_CONTRACT.JOBS.SYNC_INSTANTIATE_CONTRACTS)
  async handleInstantiateContract() {
    try {
      const highestSyncedHeight =
        await this.smartContractRepository.getLatestBlockHeight();

      await this.syncSmartContract(highestSyncedHeight, LIMIT_NUMBS.LIMIT_100);
    } catch (err) {
      throw new Error(err.stack);
    }
  }

  //call horoscope sync new contract from height, update on duplicate contract_address.
  async syncSmartContract(fromHeight: number, limit: number) {
    this.logger.log(
      `syncSmartContract was called with ${JSON.stringify({
        fromHeight,
        limit,
      })})}`,
    );
    try {
      // Get list contract from indexer
      const contractAttrs = `address
                              code_id
                              creator
                              instantiate_hash
                              instantiate_height
                              name`;
      const queryListContract = {
        query: util.format(
          INDEXER_V2_API.GRAPH_QL.SMART_CONTRACT,
          contractAttrs,
        ),
        variables: {
          whereClause: { instantiate_height: { _gte: fromHeight } },
          limit: limit,
        },
      };
      const contractsData = (
        await this._commonUtil.fetchDataFromGraphQL(queryListContract)
      ).data[ENV_CONFIG.INDEXER_V2.CHAIN_DB]['smart_contract'];
      if (contractsData.length > 1) {
        const newContracts = await Promise.all(
          contractsData.map((contractData) =>
            SyncDataHelpers.makeInstantiateContractData(contractData),
          ),
        );

        await this.smartContractRepository.upsert(newContracts, [
          'contract_address',
        ]);
      } else {
        this.logger.log('No new smart-contract was inserted.');
      }
    } catch (error) {
      throw new Error(error.stack);
    }
  }

  @Process(QUEUES.SYNC_CONTRACT.JOBS.SYNC_EXECUTE_CONTRACTS)
  async handleExecuteContract(job: Job) {
    const message = job.data.message;
    const contractAddress = job.data.contractAddress;
    this.logger.log(`${this.handleExecuteContract.name} was called!`);

    try {
      // Get numTokens when contract mint or burn
      this.logger.log(
        `Check contract address Mint or Burn: ${contractAddress}`,
      );

      // Get contract info
      const contractInfo = await this.smartContractRepository.getContractInfo(
        contractAddress,
      );
      if (contractInfo && contractInfo.type === CONTRACT_TYPE.CW20) {
        // Update market info of contract
        const marketing = message?.msg?.update_marketing || undefined;

        if (marketing) {
          //FIXME: migrate to horoscope v2.
          const urlRequest = `${this.indexerUrl}${util.format(
            INDEXER_API.GET_SMART_CONTRACT_BT_CONTRACT_ADDRESS,
            this.indexerChainId,
            contractAddress,
          )}`;
          const responses = await this._commonUtil.getDataAPI(urlRequest, '');
          const marketingInfo =
            responses?.data?.smart_contracts[0]?.marketing_info || undefined;
          if (marketingInfo) {
            contractInfo.description = marketingInfo?.description || '';
            contractInfo.image = marketingInfo.logo?.url || '';
          }

          await this.smartContractRepository.update(contractInfo);

          // Add data to token_markets market table
          if (contractInfo?.result === CONTRACT_CODE_RESULT.CORRECT) {
            const tokenInfo = SyncDataHelpers.makeTokenMarket(contractInfo);
            await this.tokenMarketsRepository.insertOnDuplicate(
              [tokenInfo],
              ['id'],
            );
          }
        }
      } else {
        const lstContract = job.data.contractArr;
        if (lstContract.length > 0) {
          await this.updateNumTokenContract(lstContract);
        }
      }
    } catch (error) {
      this.logger.error(
        `${this.handleExecuteContract.name} has error: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process(QUEUES.SYNC_CONTRACT.JOBS.SYNC_CW4973_NFT_STATUS)
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

  async updateNumTokenContract(contractAddress: []) {
    this.logger.log(
      `Call contract lcd api to query num_tokens with parameter: contract_address: ${contractAddress}`,
    );
    let urlRequest = `${this.indexerUrl}${util.format(
      INDEXER_API.GET_SMART_CONTRACT_BT_LIST_CONTRACT_ADDRESS,
      this.indexerChainId,
    )}`;
    contractAddress?.forEach((item) => {
      urlRequest += `&contract_addresses[]=${item}`;
    });

    const responses = await this._commonUtil.getDataAPI(urlRequest, '');
    if (responses?.data?.smart_contracts.length > 0) {
      const contractAddressLst = responses.data?.smart_contracts?.map(
        (i) => i.contract_address,
      );

      const smartContract = await this.smartContractRepository.find({
        where: {
          contract_address: In(contractAddressLst),
        },
      });
      responses.data?.smart_contracts?.forEach((contract) => {
        smartContract?.forEach((item) => {
          if (contract.contract_address === item.contract_address) {
            item.num_tokens = contract.num_tokens || 0;
          }
        });
      });
      if (smartContract.length > 0) {
        await this.smartContractRepository.update(smartContract);
      }

      this.logger.log(
        `${this.handleExecuteContract.name} execute complete: contract_address: ${contractAddress}`,
      );
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id} of type ${job.name}...`);
  }

  @OnQueueCompleted()
  async onComplete(job: Job) {
    this.logger.log(`Completed job ${job.id} of type ${job.name}`);
  }

  @OnQueueError()
  onError(job: Job, error: Error) {
    this.logger.error(`Error job ${job.id} of type ${job.name}`);
    this.logger.error(error.stack);
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}`);
    this.logger.error(error.stack);
  }
}
