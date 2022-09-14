import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  CONST_PROPOSAL_STATUS,
  CONST_PROPOSAL_TYPE,
  NODE_API
} from '\../common/constants/app.constant';
import { SyncDataHelpers } from '../helpers/sync-data.helpers';
import { ProposalRepository } from '../repositories/proposal.repository';
import { ValidatorRepository } from '../repositories/validator.repository';
import { ENV_CONFIG } from '../shared/services/config.service';
import { CommonUtil } from '../utils/common.util';

@Injectable()
export class SyncProposalService {
  private readonly _logger = new Logger(SyncProposalService.name);
  private api;
  private isSync = false;

  constructor(
    private _commonUtil: CommonUtil,
    private validatorRepository: ValidatorRepository,
    private proposalRepository: ProposalRepository,
  ) {
    this._logger.log(
      '============== Constructor Sync Proposal Service ==============',
    );
    this.api = ENV_CONFIG.NODE.API;
  }

  @Interval(3000)
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
          let proposalTally = null;
          if (
            item.status === CONST_PROPOSAL_STATUS.PROPOSAL_STATUS_VOTING_PERIOD
          ) {
            // Get tally of proposal
            try {
              const paramsTally = `cosmos/gov/v1beta1/proposals/${item.proposal_id}/tally`;
              proposalTally = await this._commonUtil.getDataAPI(
                this.api,
                paramsTally,
              );
            } catch (err) {
              this._logger.error(`Proposal ${item.proposal_id} end voting`);
            }
          }
          //create proposal
          const proposal = SyncDataHelpers.makerProposalData(
            item,
            proposalTally,
          );

          // Set proposer for proposal
          try{
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
          }catch(err){
            this._logger.error(`Proposal ${item.proposal_id} haven't proposer`);            
          }

          if (item.total_deposit && item.total_deposit.length > 0) {
            proposal.pro_total_deposits = item.total_deposit[0].amount;
          }

          // sync turnout
          if (item.status !== CONST_PROPOSAL_STATUS.PROPOSAL_STATUS_PASSED
            && item.status !== CONST_PROPOSAL_STATUS.PROPOSAL_STATUS_REJECTED) {
            //get bonded token
            const bondedTokens = await this._commonUtil.getDataAPI(
              this.api,
              NODE_API.STAKING_POOL,
            );
            proposal.pro_turnout =
              ((Number(proposal.pro_votes_yes) +
                Number(proposal.pro_votes_abstain) +
                Number(proposal.pro_votes_no) +
                Number(proposal.pro_votes_no_with_veto)) *
                100) /
              Number(bondedTokens.pool.bonded_tokens);
          }

          // sync request amount
          const proposalType = proposal.pro_type.substring(
            proposal.pro_type.lastIndexOf('.') + 1,
          );
          if (proposalType === CONST_PROPOSAL_TYPE.COMMUNITY_POOL_SPEND_PROPOSAL && item.content?.amount.length > 0) {
            proposal.request_amount = Number(item.content.amount[0].amount);
          } 

          // insert into table proposals
          await this.proposalRepository.insertOnDuplicate([proposal], ['pro_id']);
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
