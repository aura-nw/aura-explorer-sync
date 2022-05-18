import { Inject, Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { CONST_PROPOSAL_STATUS, NODE_API } from "../../common/constants/app.constant";
import { Proposal } from "../../entities/proposal.entity";
import { REPOSITORY_INTERFACE } from "../../module.config";
import { IProposalRepository } from "../../repositories/iproposal.repository";
import { IValidatorRepository } from "../../repositories/ivalidator.repository";
import { ConfigService } from "../../shared/services/config.service";
import { CommonUtil } from "../../utils/common.util";
import { ISyncProposalService } from "../isync-proposal.service";

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

  // @Interval(500)
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
        data = data.sort((a, b) => Number(b.proposal_id) - Number(a.proposal_id));
        for (let i = 0; i < data.length; i++) {
          const item: any = data[i];
          //create proposal
          let proposal = new Proposal();
          proposal.pro_id = Number(item.proposal_id);
          proposal.pro_title = item.content['title'];
          proposal.pro_description = item.content['description'];
          proposal.pro_status = item.status;
          proposal.pro_proposer_address = '';
          proposal.pro_proposer = '';
          const paramsProposer = `gov/proposals/${item.proposal_id}/proposer`;
          const dataProposer = await this._commonUtil.getDataAPI(this.api, paramsProposer);
          if (dataProposer && dataProposer.result) {
            proposal.pro_proposer_address = dataProposer.result.proposer;
            //get validator
            const validator = await this.validatorRepository.findOne({
              where: { acc_address: dataProposer.result.proposer },
            });
            if (validator) {
              proposal.pro_proposer = validator.title;
            }
          }
          proposal.pro_voting_start_time = new Date(item.voting_start_time);
          proposal.pro_voting_end_time = new Date(item.voting_end_time);
          proposal.pro_votes_yes = 0.0;
          proposal.pro_votes_abstain = 0.0;
          proposal.pro_votes_no = 0.0;
          proposal.pro_votes_no_with_veto = 0.0;
          if (proposal.pro_status === CONST_PROPOSAL_STATUS.PROPOSAL_STATUS_VOTING_PERIOD) {
            //get proposal tally
            const paramsTally = `cosmos/gov/v1beta1/proposals/${item.proposal_id}/tally`;
            const proposalTally = await this._commonUtil.getDataAPI(this.api, paramsTally);
            proposal.pro_votes_yes = proposalTally.tally.yes;
            proposal.pro_votes_abstain = proposalTally.tally.abstain;
            proposal.pro_votes_no = proposalTally.tally.no;
            proposal.pro_votes_no_with_veto = proposalTally.tally.no_with_veto;
          } else {
            proposal.pro_votes_yes = item.final_tally_result.yes;
            proposal.pro_votes_abstain = item.final_tally_result.abstain;
            proposal.pro_votes_no = item.final_tally_result.no;
            proposal.pro_votes_no_with_veto = item.final_tally_result.no_with_veto;
          }
          proposal.pro_submit_time = new Date(item.submit_time);
          proposal.pro_total_deposits = 0.0;
          if (item.total_deposit && item.total_deposit.length > 0) {
            proposal.pro_total_deposits = item.total_deposit[0].amount;
          }
          //set value for column not null
          proposal.pro_tx_hash = '';
          proposal.pro_type = item.content['@type'];
          proposal.pro_deposit_end_time = new Date(item.deposit_end_time);
          proposal.pro_activity = null;
          proposal.is_delete = false;
          //sync turnout
          //get bonded token
          const bondedTokens = await this._commonUtil.getDataAPI(this.api, NODE_API.STAKING_POOL);
          if (bondedTokens && Number(bondedTokens.pool.bonded_tokens) > 0) {
            proposal.pro_turnout = ((Number(proposal.pro_votes_yes) + Number(proposal.pro_votes_abstain) + Number(proposal.pro_votes_no) + Number(proposal.pro_votes_no_with_veto)) * 100) / Number(bondedTokens.pool.bonded_tokens);
          }
          // insert into table proposals
          try {
            await this.proposalRepository.create(proposal);
          } catch (error) {
            await this.proposalRepository.update(proposal);
            this._logger.error(null, `Proposal is already existed!`);
          }
        }
        //delete proposal failed
        const listId = data.map((i) => Number(i.proposal_id));
        await this.proposalRepository.deleteProposalsByListId(listId);
      }
      this.isSync = false;
    } catch (error) {
      this._logger.error(error, `Sync proposals error`);
      this.isSync = false;
    }
  }

  /**
   * getProposalsFromNode
   * @param rootApi 
   * @returns 
   */
  async getProposalsFromNode(rootApi: string): Promise<any> {
    let result = await this._commonUtil.getDataAPI(rootApi, NODE_API.PROPOSALS);
    let key = result.pagination.next_key;
    result = result.proposals;
    while (key != null) {
      const params = `cosmos/gov/v1beta1/proposals?pagination.key=${key}`;
      let dataProposal = await this._commonUtil.getDataAPI(rootApi, params);
      key = dataProposal.pagination.next_key;
      result = [...result, ...dataProposal.proposals];
    }
    return result;
  }
}