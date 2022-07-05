import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SyncDataHelpers } from 'src/helpers/sync-data.helpers';
import {
  CONST_PROPOSAL_STATUS,
  NODE_API,
} from '../../common/constants/app.constant';
import { Proposal } from '../../entities/proposal.entity';
import { REPOSITORY_INTERFACE } from '../../module.config';
import { IProposalRepository } from '../../repositories/iproposal.repository';
import { IValidatorRepository } from '../../repositories/ivalidator.repository';
import { ConfigService } from '../../shared/services/config.service';
import { CommonUtil } from '../../utils/common.util';
import { ISyncProposalService } from '../isync-proposal.service';

@Injectable()
export class SyncProposalService implements ISyncProposalService {
  private readonly _logger = new Logger(SyncProposalService.name);
  private api;
  private isSync = false;

  constructor(
    private configService: ConfigService,
    private _commonUtil: CommonUtil,
    @Inject(REPOSITORY_INTERFACE.IVALIDATOR_REPOSITORY)
    private validatorRepository: IValidatorRepository,
    @Inject(REPOSITORY_INTERFACE.IPROPOSAL_REPOSITORY)
    private proposalRepository: IProposalRepository,
  ) {
    this._logger.log(
      '============== Constructor Sync Proposal Service ==============',
    );
    this.api = this.configService.get('API');
  }

  @Interval(500)
  async handleInterval() {
    // check status
    if (this.isSync) {
      this._logger.log(null, 'already syncing proposals... wait');
      return;
    } else {
      this._logger.log(null, 'fetching data proposals...');
    }
    try {
      //fetching proposals from node
      let data = await this.getProposalsFromNode(this.api);
      this.isSync = true;

      if (data && data.length > 0) {
        data = data.sort(
          (a, b) => Number(b.proposal_id) - Number(a.proposal_id),
        );
        for (let i = 0; i < data.length; i++) {
          const item: any = data[i];
          let proposalTally = undefined;
          if (
            item.pro_status ===
            CONST_PROPOSAL_STATUS.PROPOSAL_STATUS_VOTING_PERIOD
          ) {
            const paramsTally = `cosmos/gov/v1beta1/proposals/${item.proposal_id}/tally`;
            proposalTally = await this._commonUtil.getDataAPI(
              this.api,
              paramsTally,
            );
          }
          //create proposal
          const proposal = SyncDataHelpers.makerProposalData(
            item,
            proposalTally,
          );

          const paramsProposer = `gov/proposals/${item.proposal_id}/proposer`;
          const dataProposer = await this._commonUtil.getDataAPI(
            this.api,
            paramsProposer,
          );

          if (dataProposer && dataProposer.result) {
            proposal.pro_proposer_address = dataProposer.result.proposer;
            const validator = await this.validatorRepository.findOne({
              where: { acc_address: dataProposer.result.proposer },
            });
            if (validator) {
              proposal.pro_proposer = validator.title;
            }
          }

          if (item.total_deposit && item.total_deposit.length > 0) {
            proposal.pro_total_deposits = item.total_deposit[0].amount;
          }

          //sync turnout
          //get bonded token
          const bondedTokens = await this._commonUtil.getDataAPI(
            this.api,
            NODE_API.STAKING_POOL,
          );
          if (bondedTokens && Number(bondedTokens.pool.bonded_tokens) > 0) {
            proposal.pro_turnout =
              ((Number(proposal.pro_votes_yes) +
                Number(proposal.pro_votes_abstain) +
                Number(proposal.pro_votes_no) +
                Number(proposal.pro_votes_no_with_veto)) *
                100) /
              Number(bondedTokens.pool.bonded_tokens);
          }

          // insert into table proposals
          await this.proposalRepository.upsert([proposal], []);
        }
      }
      //delete proposal failed
      const listId = data.map((i) => Number(i.proposal_id));
      if (listId?.length > 0) {
        await this.proposalRepository.deleteProposals();
      }
      this.isSync = false;
    } catch (error) {
      // this._logger.error(error, `Sync proposals error`);
      this._logger.error(
        null,
        `Sync Proposol was error, ${error.name}: ${error.message}`,
      );
      this._logger.error(null, `${error.stack}`);
      this.isSync = false;
      throw error;
    }
  }

  /**
   * getProposalsFromNode
   * @param rootApi
   * @returns
   */
  async getProposalsFromNode(rootApi: string): Promise<any> {
    let result = await this._commonUtil.getDataAPI(rootApi, NODE_API.PROPOSALS);
    result = result.proposals;
    return result;
  }
}
