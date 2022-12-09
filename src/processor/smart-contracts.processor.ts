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
import * as util from 'util';
import {
  COINGECKO_API,
  CONST_CHAR,
  CONTRACT_CODE_RESULT,
  CONTRACT_TYPE,
  INDEXER_API,
  MAINNET_UPLOAD_STATUS,
  REDIS_KEY,
  SMART_CONTRACT_VERIFICATION,
} from '../common/constants/app.constant';
import { SmartContract, TokenMarkets } from '../entities';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { DeploymentRequestsRepository } from '../repositories/deployment-requests.repository';
import { SmartContractCodeRepository } from '../repositories/smart-contract-code.repository';
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import { ConfigService, ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { RedisUtil } from '../utils/redis.util';

import { HttpService } from '@nestjs/axios';
import { In } from 'typeorm';
import { InfluxDBClient } from '../utils/influxdb-client';

@Processor('smart-contracts')
export class SmartContractsProcessor {
  private readonly logger = new Logger(SmartContractsProcessor.name);
  private rpc;
  private api;
  private smartContractService;
  private nodeEnv = ENV_CONFIG.NODE_ENV;
  private indexerUrl;
  private indexerChainId;
  private influxDbClient: InfluxDBClient;

  constructor(
    private _commonUtil: CommonUtil,
    private configService: ConfigService,
    private smartContractRepository: SmartContractRepository,
    private tokenMarketsRepository: TokenMarketsRepository,
    private deploymentRequestsRepository: DeploymentRequestsRepository,
    private redisUtil: RedisUtil,
    private httpService: HttpService,
    private smartContractCodeRepository: SmartContractCodeRepository,
  ) {
    this.logger.log(
      '============== Constructor Smart Contracts Processor Service ==============',
    );

    this.rpc = ENV_CONFIG.NODE.RPC;
    this.api = ENV_CONFIG.NODE.API;
    this.indexerUrl = this.configService.get('INDEXER_URL');
    this.indexerChainId = this.configService.get('INDEXER_CHAIN_ID');

    this.smartContractService = ENV_CONFIG.SMART_CONTRACT_SERVICE;

    // Connect influxdb
    this.connectInfluxdb();
  }

  @Process('sync-instantiate-contracts')
  async handleInstantiateContract(job: Job) {
    this.logger.log(`Sync instantiate contracts by job Id ${job.id}`);
    this.logger.log(job.data);
    const height = job.data.height;
    await this.instantiateContracts(height);
  }

  async instantiateContracts(height: number) {
    this.logger.log(
      `${this.instantiateContracts.name} was called with height: ${height}`,
    );
    const limit = 100;
    let offset = 0;
    let nextKey = await this.syncSmartContract(height, limit, offset);
    if (nextKey) {
      while (nextKey) {
        try {
          offset = (offset + 1) * limit;
          nextKey = await this.syncSmartContract(height, limit, offset);
        } catch (error) {
          this.logger.error(
            `${this.instantiateContracts.name} call error: ${error.stack}`,
          );
          nextKey = null;
          throw error;
        }
      }
    }
  }

  /**
   * Sync data smart contract from indexer
   * @param height
   * @param limit
   * @param offset
   * @returns
   */
  async syncSmartContract(height: number, limit: number, offset: number) {
    this.logger.log(
      `${this.syncSmartContract.name} was called with height: ${height}`,
    );
    try {
      // Get contract from indexer
      const urlRequest = `${this.indexerUrl}${util.format(
        INDEXER_API.GET_SMART_CONTRACTS,
        this.indexerChainId,
        limit,
        offset,
      )}&height=${height}`;

      // Get list smart contract from Indexer(Heroscope)
      const responses = await this._commonUtil.getDataAPI(urlRequest, '');
      const smartContracts: [] = responses?.data.smart_contracts;
      const nextKey = responses?.data.next_key;

      if (smartContracts.length > 0) {
        const contracts: SmartContract[] = [];
        for (let i = 0; i < smartContracts.length; i++) {
          const item: any = smartContracts[i];
          const smartContract = await this.makeInstantiateContractData(item);
          contracts.push(smartContract);
        }
        this.logger.log(
          `Insert data to smart_contracts table : ${JSON.stringify(contracts)}`,
        );
        const result = await this.smartContractRepository.insertOnDuplicate(
          contracts,
          ['id'],
        );
        this.logger.log(`Sync Instantiate Contract Result: ${result}`);
        return nextKey;
      }
    } catch (error) {
      this.logger.error(
        `${this.syncSmartContract.name} call error: ${error.stack}`,
      );
      throw error.message;
    }
  }

  @Process('sync-execute-contracts')
  async handleExecuteContract(job: Job) {
    const txData = job.data.txData;
    const message = job.data.message;
    const contractAddress = message.contract;
    const height = Number(txData.tx_response.height);
    this.logger.log(
      `${
        this.handleExecuteContract.name
      } was called with data: ${JSON.stringify(job.data)}`,
    );

    try {
      // Get constract instantiate
      this.logger.log(`Get contract instantiate`);
      const contractInstantiate = txData.tx_response.logs?.filter((f) =>
        f.events.find((x) => x.type == CONST_CHAR.INSTANTIATE),
      );
      if (contractInstantiate && contractInstantiate.length > 0) {
        await this.instantiateContracts(height);
      }

      // Get numTokens when contract mint or burn
      const burnOrMintMessages =
        message.msg?.mint?.token_id || message.msg?.burn?.token_id;
      this.logger.log(
        `Check constract address Mint or Burn: ${JSON.stringify(
          burnOrMintMessages,
        )}`,
      );

      if (burnOrMintMessages) {
        await this.updateNumTokenContract(contractAddress);
      }

      //Update tokens martket
      const smartContract = await this.smartContractRepository.findOne({
        where: { contract_address: contractAddress },
      });
      if (smartContract) {
        const smartContractCode =
          await this.smartContractCodeRepository.findOne({
            where: {
              code_id: smartContract?.code_id,
              result: CONTRACT_CODE_RESULT.CORRECT,
              type: CONTRACT_TYPE.CW20,
            },
          });
        if (smartContractCode) {
          const tokenInfo = new TokenMarkets();
          tokenInfo.coin_id = tokenInfo.coin_id || '';
          tokenInfo.contract_address = smartContract.contract_address;
          tokenInfo.name = smartContract.token_name || '';
          tokenInfo.symbol = smartContract.token_symbol || '';
          tokenInfo.code_id = smartContract.code_id;
          if (smartContract.image) {
            tokenInfo.image = smartContract.image;
          }
          tokenInfo.description = smartContract.description || '';
          await this.smartContractCodeRepository.create(tokenInfo);
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

  connectInfluxdb() {
    this.logger.log(
      `============== call connectInfluxdb method ==============`,
    );
    try {
      this.influxDbClient = new InfluxDBClient(
        ENV_CONFIG.INFLUX_DB.BUCKET,
        ENV_CONFIG.INFLUX_DB.ORGANIZTION,
        ENV_CONFIG.INFLUX_DB.URL,
        ENV_CONFIG.INFLUX_DB.TOKEN,
      );
      if (this.influxDbClient) {
        this.influxDbClient.initWriteApi();
      }
    } catch (err) {
      this.logger.log(
        `call connectInfluxdb method has error: ${err.message}`,
        err.stack,
      );
    }
  }

  @Process('sync-price-volume')
  async handleSyncPriceVolume(job: Job) {
    try {
      this.logger.log(job.data);
      const listTokens = job.data.listTokens;
      const coingecko = ENV_CONFIG.COINGECKO;
      this.logger.log(`============== Call Coingecko Api ==============`);
      const coinIds = listTokens.join(',');
      const coinMarkets: TokenMarkets[] = [];

      const para = `${util.format(
        COINGECKO_API.GET_COINS_MARKET,
        coinIds,
        coingecko.MAX_REQUEST,
      )}`;

      const [response, tokenInfos] = await Promise.all([
        this._commonUtil.getDataAPI(coingecko.API, para),
        this.tokenMarketsRepository.find({
          where: {
            coin_id: In(listTokens),
          },
        }),
      ]);

      if (response) {
        for (let index = 0; index < response.length; index++) {
          const data = response[index];
          let tokenInfo = tokenInfos?.find((f) => f.coin_id === data.id);
          tokenInfo = SyncDataHelpers.updateTokenMarketsData(tokenInfo, data);
          coinMarkets.push(tokenInfo);
        }
      }
      if (coinMarkets.length > 0) {
        await this.tokenMarketsRepository.update(coinMarkets);

        this.logger.log(`============== Write data to Influxdb ==============`);
        await this.influxDbClient.writeBlockTokenPriceAndVolume(coinMarkets);
        this.logger.log(
          `============== Write data to Influxdb  successfully ==============`,
        );
      }
    } catch (err) {
      this.logger.log(`sync-price-volume has error: ${err.message}`, err.stack);
      // Reconnect influxDb
      const errorCode = err?.code || '';
      if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
        this.connectInfluxdb();
      }
    }
  }

  @Process('sync-coin-id')
  async handleSyncCoinId(job: Job) {
    try {
      this.logger.log(
        `============== sync-coin-id from coingecko start ==============`,
      );
      this.logger.log(job.data);
      const tokens = job.data.tokens;

      await this.redisUtil.connect();
      const coingeckoCoins = await this.redisUtil.getValue(
        REDIS_KEY.COINGECKO_COINS,
      );
      const coinList = JSON.parse(coingeckoCoins);
      const platform = ENV_CONFIG.COINGECKO.COINGEKO_PLATFORM;
      const updatingTokens: TokenMarkets[] = [];

      tokens.forEach((item: TokenMarkets) => {
        const coinInfo = coinList.find(
          (f) => f.platforms?.[`${platform}`] === item.contract_address,
        );
        if (coinInfo) {
          item.coin_id = coinInfo.id;
          updatingTokens.push(item);
        }
      });

      if (updatingTokens.length > 0) {
        await this.tokenMarketsRepository.update(updatingTokens);
      }
    } catch (err) {
      this.logger.error(`sync-coin-id has error: ${err.message}`, err.stack);
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
  onFailed(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}`);
    this.logger.error(`Error: ${error}`);
  }

  /**
   * Create Smart contract data
   * @param contract
   * @returns
   */
  async makeInstantiateContractData(contract: any) {
    const smartContract = new SmartContract();
    smartContract.id = 0;
    smartContract.height = contract.height;
    smartContract.code_id = contract.code_id;
    smartContract.contract_name = contract.contract_name;
    smartContract.contract_address = contract.contract_address;
    smartContract.creator_address = contract.creator_address;
    smartContract.contract_hash = contract.contract_hash;
    smartContract.tx_hash = contract.tx_hash;
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

    const tokenInfo = contract.token_info;
    if (tokenInfo) {
      smartContract.token_name = tokenInfo.name;
      smartContract.token_symbol = tokenInfo.symbol;
      smartContract.decimals = tokenInfo.decimals;
    }

    const marketingInfo = contract.marketing_info;
    if (marketingInfo) {
      smartContract.description = marketingInfo.description;
      smartContract.image = marketingInfo.logo.url;
      smartContract.code_id = contract.code_id;
    }

    const contractInfo = contract.contract_info;
    if (contractInfo) {
      smartContract.token_name = contractInfo.name;
      smartContract.token_symbol = contractInfo.symbol;
    }

    if (this.nodeEnv === 'mainnet') {
      const [requests, existContracts] = await Promise.all([
        this.deploymentRequestsRepository.findByCondition({
          mainnet_code_id: smartContract.code_id,
        }),
        this.smartContractRepository.findByCondition({
          code_id: smartContract.code_id,
        }),
      ]);
      if (existContracts.length > 0) {
        smartContract.contract_verification =
          SMART_CONTRACT_VERIFICATION.VERIFIED;
        smartContract.contract_match = existContracts[0].contract_address;
      } else
        smartContract.contract_verification =
          SMART_CONTRACT_VERIFICATION.VERIFIED;
      const request = requests[0];
      smartContract.contract_hash = request.contract_hash;
      smartContract.url = request.url;
      smartContract.compiler_version = request.compiler_version;
      smartContract.instantiate_msg_schema = request.instantiate_msg_schema;
      smartContract.query_msg_schema = request.query_msg_schema;
      smartContract.execute_msg_schema = request.execute_msg_schema;
      smartContract.s3_location = request.s3_location;
      smartContract.reference_code_id = request.euphoria_code_id;
      smartContract.mainnet_upload_status = null;
      smartContract.verified_at = new Date();
      smartContract.project_name = request.project_name;
      smartContract.request_id = request.request_id;
    } else {
      if (smartContract.contract_hash !== '') {
        const [exactContract, sameContractCodeId] = await Promise.all([
          this.smartContractRepository.findExactContractByHash(
            smartContract.contract_hash,
          ),
          this.smartContractRepository.findByCondition({
            code_id: smartContract.code_id,
          }),
        ]);
        if (exactContract) {
          smartContract.contract_verification =
            SMART_CONTRACT_VERIFICATION.VERIFIED;
          smartContract.contract_match = exactContract.contract_address;
          smartContract.url = exactContract.url;
          smartContract.compiler_version = exactContract.compiler_version;
          smartContract.instantiate_msg_schema =
            exactContract.instantiate_msg_schema;
          smartContract.query_msg_schema = exactContract.query_msg_schema;
          smartContract.execute_msg_schema = exactContract.execute_msg_schema;
          smartContract.s3_location = exactContract.s3_location;
          smartContract.verified_at = new Date();
          smartContract.mainnet_upload_status =
            MAINNET_UPLOAD_STATUS.NOT_REGISTERED;
        }
        if (sameContractCodeId.length > 0) {
          const sameContract = sameContractCodeId[0];
          smartContract.reference_code_id = sameContract.reference_code_id;
          smartContract.mainnet_upload_status =
            sameContract.mainnet_upload_status as MAINNET_UPLOAD_STATUS;
          smartContract.project_name = sameContract.project_name;
          smartContract.request_id = sameContract.request_id;
        }
      }
    }
    return smartContract;
  }

  /**
   * Update num_tokens column
   * @param height
   * @param message
   */
  async updateNumTokenContract(contractAddress: string) {
    this.logger.log(
      `Call contract lcd api to query num_tokens with parameter: {contract_address: ${contractAddress}}`,
    );

    const urlRequest = `${this.indexerUrl}${util.format(
      INDEXER_API.GET_SMART_CONTRACTS,
      this.indexerChainId,
      1,
      0,
    )}&contract_addresses=${contractAddress}`;
    const responses = await this._commonUtil.getDataAPI(
      urlRequest,
      `contract_addresses: ${contractAddress}`,
    );
    if (responses?.data) {
      const numTokens = responses.data?.smart_contracts[0]?.num_tokens || 0;
      if (numTokens > 0) {
        await this.smartContractRepository.updateNumtokens(
          contractAddress,
          numTokens || 0,
        );
        this.logger.log(
          `${this.handleExecuteContract.name} execute complete: Contract address: ${contractAddress}, numTokens: ${numTokens}`,
        );
      }
    }
  }
}
