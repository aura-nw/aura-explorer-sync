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
import { SmartContractRepository } from '../repositories/smart-contract.repository';
import { ConfigService, ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';
import { SmartContractCodeRepository } from '../repositories/smart-contract-code.repository';
import { RedisUtil } from '../utils/redis.util';
import * as util from 'util';
import { TokenMarketsRepository } from '../repositories/token-markets.repository';
import { In } from 'typeorm';
import { InfluxDBClient } from '../utils/influxdb-client';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

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
    private smartContractCodeRepository: SmartContractCodeRepository,
    private redisUtil: RedisUtil,
    private httpService: HttpService,
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
    this.logger.log(job.data);
    const smartContracts = [];
    const txData = job.data.txData;
    try {
      const contract_name = txData.tx.body.messages[0].label;
      const height = txData.tx_response.height;
      const creator_address = txData.tx.body.messages[0].sender;
      const tx_hash = txData.tx_response.txhash;
      const contract_addresses = txData.tx_response.logs[0].events
        .find((x) => x.type == CONST_CHAR.INSTANTIATE)
        .attributes.filter((x) => x.key == CONST_CHAR._CONTRACT_ADDRESS);
      const code_ids = txData.tx_response.logs[0].events
        .find((x) => x.type == CONST_CHAR.INSTANTIATE)
        .attributes.filter((x) => x.key == CONST_CHAR.CODE_ID);
      for (let i = 0; i < contract_addresses.length; i++) {
        const code_id = code_ids[i].value;
        const contract_address = contract_addresses[i].value;
        let smartContract = await this.makeInstantiateContractData(
          height,
          code_id,
          contract_name,
          contract_address,
          creator_address,
          tx_hash,
        );
        //update token info by code id
        smartContract = await this.updateTokenInfoByCodeId(smartContract);
        smartContracts.push(smartContract);
      }

      let liquidityContractAddr;
      try {
        liquidityContractAddr = txData.tx_response.logs[0].events
          .find(({ type }) => type === CONST_CHAR.WASM)
          .attributes.find(
            ({ key }) => key === CONST_CHAR.LIQUIDITY_TOKEN_ADDR,
          ).value;
      } catch (error) {
        this.logger.log(
          null,
          `This transaction doesn't create a liquidity token`,
        );
      }
      if (liquidityContractAddr !== undefined) {
        const paramGetContract = `/cosmwasm/wasm/v1/contract/${liquidityContractAddr}`;
        const contractResponse = await this._commonUtil.getDataAPI(
          this.api,
          paramGetContract,
        );
        const liquidityCodeId = contractResponse.contract_info.code_id;
        const liquidityContractName = contractResponse.contract_info.label;
        const liquidityContractCreator = contractResponse.contract_info.creator;

        let liquidityContract = await this.makeInstantiateContractData(
          height,
          liquidityCodeId,
          liquidityContractName,
          liquidityContractAddr,
          liquidityContractCreator,
          tx_hash,
        );
        //update token info by code id
        liquidityContract = await this.updateTokenInfoByCodeId(
          liquidityContract,
        );
        smartContracts.push(liquidityContract);
      }
    } catch (error) {
      this.logger.error(null, `Got error in instantiate contract transaction`);
      this.logger.error(null, `${error.stack}`);
    }

    if (smartContracts.length > 0) {
      smartContracts.map(async (smartContract) => {
        if (smartContract.contract_name == '') {
          const param = `/cosmwasm/wasm/v1/contract/${smartContract.contract_address}`;
          const contractData = await this._commonUtil.getDataAPI(
            this.api,
            param,
          );
          smartContract.contract_name = contractData.contract_info.label;
        }
      });
      const result = this.smartContractRepository.insertOnDuplicate(
        smartContracts,
        ['id'],
      );
      this.logger.log(`Sync Instantiate Contract Result: ${result}`);
    }
  }

  @Process('sync-execute-contracts')
  async handleExecuteContract(job: Job) {
    this.logger.log(job.data);
    const txData = job.data.txData;
    const message = job.data.message;
    const smartContracts = [];
    try {
      const _smartContracts = SyncDataHelpers.makeExecuteContractData(
        txData,
        message,
      );
      for (const item of _smartContracts) {
        const smartContract = await this.makeInstantiateContractData(
          item.height,
          item.code_id,
          '',
          item.contract_address,
          item.creator_address,
          item.tx_hash,
        );
        smartContracts.push(smartContract);
      }
    } catch (error) {
      this.logger.log(null, `Got error in execute contract transaction`);
      this.logger.log(null, `${error.stack}`);
    }

    if (smartContracts.length > 0) {
      smartContracts.map(async (smartContract) => {
        if (smartContract.contract_name == '') {
          const param = `/cosmwasm/wasm/v1/contract/${smartContract.contract_address}`;
          const contractData = await this._commonUtil.getDataAPI(
            this.api,
            param,
          );
          smartContract.contract_name = contractData.contract_info.label;
        }
      });
      const result = this.smartContractRepository.insertOnDuplicate(
        smartContracts,
        ['id'],
      );
      this.logger.log(`Sync Instantiate Contract Result: ${result}`);
    }
  }

  @Process('sync-token')
  async handleSyncToken(job: Job) {
    this.logger.log(job.data);
    const listTokens = job.data.listTokens;
    const type = job.data.type;

    if (listTokens.length === 0) return;

    await this.redisUtil.connect();
    const coingeckoCoins = await this.redisUtil.getValue(
      REDIS_KEY.COINGECKO_COINS,
    );
    const coinList = JSON.parse(coingeckoCoins);
    const platform = ENV_CONFIG.COINGECKO.COINGEKO_PLATFORM;
    const smartContracts = [];
    const tokenMarkets = [];
    const lstAddress = listTokens.map((i) => i.contract_address);
    const contracts = await this.smartContractRepository.find({
      where: { contract_address: In(lstAddress) },
    });
    const tokens = await this.tokenMarketsRepository.find({
      where: { contract_address: In(lstAddress) },
    });

    const holderResponse = await lastValueFrom(
      this.httpService.post(
        `${this.indexerUrl}${INDEXER_API.GET_HOLDER_INFO_CW20}`,
        {
          chainId: this.indexerChainId,
          addresses: lstAddress,
        },
      ),
    ).then((rs) => rs.data);

    const listHolder = holderResponse?.data || [];

    for (let i = 0; i < listTokens.length; i++) {
      const contract_address = listTokens[i].contract_address;
      let contract = contracts.find(
        (m) => m.contract_address === contract_address,
      );
      let hasUpdate = false;

      if (!contract.token_name || !contract.num_tokens) {
        contract = await this._commonUtil.queryMoreInfoFromCosmwasm(
          this.api,
          contract_address,
          contract,
          type,
        );
        hasUpdate = true;
      }

      // sync coin id from coingecko
      if (!contract.coin_id) {
        const coinInfo = coinList.find(
          (f) => f.platforms?.[`${platform}`] === contract.contract_address,
        );
        if (coinInfo) {
          contract.coin_id = coinInfo.id;
          hasUpdate = true;
        }
      }

      if (hasUpdate) {
        smartContracts.push(contract);
      }

      if (type === CONTRACT_TYPE.CW20) {
        const tokenInfo =
          tokens.find((m) => m.contract_address === contract_address) ||
          ({} as TokenMarkets);
        tokenInfo.coin_id = contract.coin_id || '';
        tokenInfo.contract_address = contract.contract_address;
        tokenInfo.name = contract.token_name || '';
        tokenInfo.symbol = contract.token_symbol || '';
        if (contract.image) {
          tokenInfo.image = contract.image;
        }

        tokenInfo.description = contract.description || '';

        // get holder
        const holderInfo = listHolder.find(
          (f) => f.contract_address === contract_address,
        );
        if (holderInfo) {
          tokenInfo.current_holder = holderInfo.new_holders || 0;
          tokenInfo.holder_change_percentage_24h =
            holderInfo.change_percent || 0;
        }

        tokenMarkets.push(tokenInfo);
      }
    }

    if (smartContracts.length > 0) {
      await this.smartContractRepository.update(smartContracts);
    }

    if (tokenMarkets.length > 0) {
      await this.tokenMarketsRepository.upsert(tokenMarkets, ['id']);
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
      const response = await this._commonUtil.getDataAPI(coingecko.API, para);
      if (response) {
        for (let index = 0; index < response.length; index++) {
          const data = response[index];

          let tokenInfo = await this.tokenMarketsRepository.findOne({
            where: { coin_id: data.id },
          });

          tokenInfo = SyncDataHelpers.updateTokenMarketsData(tokenInfo, data);

          coinMarkets.push(tokenInfo);
        }
      }
      if (coinMarkets.length > 0) {
        await this.tokenMarketsRepository.update(coinMarkets);

        this.logger.log(`============== Write data to Influxdb ==============`);
        await this.influxDbClient.writeBlockTokenPriceAndVolume(coinMarkets);
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

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id} of type ${job.name}...`);
  }

  @OnQueueCompleted()
  onComplete(job: Job, result: any) {
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

  async makeInstantiateContractData(
    height: string,
    code_id: string,
    contract_name: string,
    contract_address: string,
    creator_address: string,
    tx_hash: string,
  ) {
    const smartContract = new SmartContract();
    smartContract.id = 0;
    smartContract.height = Number(height);
    smartContract.code_id = Number(code_id);
    smartContract.contract_name = contract_name;
    smartContract.contract_address = contract_address;
    smartContract.creator_address = creator_address;
    smartContract.contract_hash = '';
    smartContract.tx_hash = tx_hash;
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

    if (this.nodeEnv === 'mainnet') {
      const [requests, existContracts] = await Promise.all([
        this.deploymentRequestsRepository.findByCondition({
          mainnet_code_id: code_id,
        }),
        this.smartContractRepository.findByCondition({
          code_id,
        }),
      ]);
      if (existContracts.length > 0) {
        smartContract.contract_verification =
          SMART_CONTRACT_VERIFICATION.SIMILAR_MATCH;
        smartContract.contract_match = existContracts[0].contract_address;
      } else
        smartContract.contract_verification =
          SMART_CONTRACT_VERIFICATION.EXACT_MATCH;
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
      const paramGetHash = `/api/v1/smart-contract/get-hash/${code_id}`;
      let smartContractResponse;
      try {
        smartContractResponse = await this._commonUtil.getDataAPI(
          this.smartContractService,
          paramGetHash,
        );
      } catch (error) {
        this.logger.error(
          'Can not connect to smart contract verify service or LCD service',
          error,
        );
      }

      if (smartContractResponse) {
        smartContract.contract_hash =
          smartContractResponse.Message.length === 64
            ? smartContractResponse.Message
            : '';
      }
      if (smartContract.contract_hash !== '') {
        const [exactContract, sameContractCodeId] = await Promise.all([
          this.smartContractRepository.findExactContractByHash(
            smartContract.contract_hash,
          ),
          this.smartContractRepository.findByCondition({ code_id }),
        ]);
        if (exactContract) {
          smartContract.contract_verification =
            SMART_CONTRACT_VERIFICATION.SIMILAR_MATCH;
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

  async updateTokenInfoByCodeId(contract: any) {
    const contractCode = await this.smartContractCodeRepository.findOne({
      where: { code_id: contract.code_id },
    });
    if (
      contractCode &&
      contractCode.result === CONTRACT_CODE_RESULT.CORRECT &&
      (contractCode.type === CONTRACT_TYPE.CW721 ||
        contractCode.type === CONTRACT_TYPE.CW20)
    ) {
      contract = await this._commonUtil.queryMoreInfoFromCosmwasm(
        this.api,
        contract.contract_address,
        contract,
        contractCode.type,
      );
    }

    return contract;
  }
}
