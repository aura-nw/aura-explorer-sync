import { Inject, Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { NODE_API } from "src/common/constants/app.constant";
import { Proposal } from "src/entities/proposal.entity";
import { REPOSITORY_INTERFACE } from "src/module.config";
import { IProposalRepository } from "src/repositories/iproposal.repository";
import { IValidatorRepository } from "src/repositories/ivalidator.repository";
import { ConfigService } from "src/shared/services/config.service";
import { CommonUtil } from "src/utils/common.util";
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

  // // @Interval(500)
  // @Interval(500)
  // async startSyncProposal() {
  //     // check status
  //     if (this.isSync) {
  //         this._logger.log(null, 'already syncing proposals... wait');
  //         return;
  //     } else {
  //         this._logger.log(null, 'fetching data proposals...');
  //     }

  //     try {
  //         const param = NODE_API.PROPOSALS;
  //         const data = await this._commonUtil.getDataAPI(this.api, param);

  //         this.isSync = true;

  //         if (data && data.proposals.length > 0) {
  //             for (let i = 0; i < data.proposals.length; i++) {
  //               const item: any = data.proposals[i];
  //               //create proposal
  //               let proposal = new Proposal();
  //               proposal.pro_id = Number(item.proposal_id);
  //               proposal.pro_title = item.content['title'];
  //               proposal.pro_description = item.content['description'];
  //               proposal.pro_status = item.status;
  //               proposal.pro_proposer_address = '';
  //               proposal.pro_proposer = '';
  //               const paramsProposer = `/gov/proposals/${item.proposal_id}/proposer`;
  //               const dataProposer = await this._commonUtil.getDataAPI(this.api, paramsProposer);
  //               if (dataProposer && dataProposer.result) {
  //                 proposal.pro_proposer_address = dataProposer.result.proposer;
  //                 //get validator
  //                 const validator = await this.validatorRepository.findOne({
  //                   where: { acc_address: dataProposer.result.proposer },
  //                 });
  //                 if (validator) {
  //                   proposal.pro_proposer = validator.title;
  //                 }
  //               }
  //               proposal.pro_voting_start_time = new Date(item.voting_start_time);
  //               proposal.pro_voting_end_time = new Date(item.voting_end_time);
  //               proposal.pro_votes_yes = 0.0;
  //               proposal.pro_votes_abstain = 0.0;
  //               proposal.pro_votes_no = 0.0;
  //               proposal.pro_votes_no_with_veto = 0.0;
  //               if (item.final_tally_result) {
  //                 proposal.pro_votes_yes = item.final_tally_result.yes;
  //                 proposal.pro_votes_abstain = item.final_tally_result.abstain;
  //                 proposal.pro_votes_no = item.final_tally_result.no;
  //                 proposal.pro_votes_no_with_veto =
  //                   item.final_tally_result.no_with_veto;
  //               }
  //               proposal.pro_submit_time = new Date(item.submit_time);
  //               proposal.pro_total_deposits = 0.0;
  //               if (item.total_deposit && item.total_deposit.length > 0) {
  //                 proposal.pro_total_deposits = item.total_deposit[0].amount;
  //               }
  //               //set value for column not null
  //               proposal.pro_tx_hash = '';
  //               proposal.pro_type = item.content['@type'];
  //               proposal.pro_deposit_end_time = new Date(item.deposit_end_time);
  //               proposal.is_delete = false;
  //               proposal.pro_activity = '{"key": "activity", "value": ""}'; //tmp value
  //               // insert into table proposals
  //               try {
  //                 await this.proposalRepository.create(proposal);
  //               } catch (error) {
  //                 this._logger.error(null, `Proposal is already existed!`);
  //               }
  //             }
  //             //delete proposal failed
  //             const listId = data.proposals.map((i) => Number(i.proposal_id));
  //             await this.proposalRepository.deleteProposalsByListId(listId);                
  //           }
  //           this.isSync = false;
  //     } catch (error) {
  //         this._logger.error(error, `Sync proposals error`);
  //         this.isSync = false;
  //     }
  // }

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
      const data = await this.getProposalsFromNode(this.api);
      this.isSync = true;

      if (data && data.proposals.length > 0) {
        for (let i = 0; i < data.proposals.length; i++) {
          const item: any = data.proposals[i];
          //create proposal
          let proposal = new Proposal();
          proposal.pro_id = Number(item.proposal_id);
          proposal.pro_title = item.content['title'];
          proposal.pro_description = item.content['description'];
          proposal.pro_status = item.status;
          proposal.pro_proposer_address = '';
          proposal.pro_proposer = '';
          const paramsProposer = `/gov/proposals/${item.proposal_id}/proposer`;
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
          if (item.final_tally_result) {
            proposal.pro_votes_yes = item.final_tally_result.yes;
            proposal.pro_votes_abstain = item.final_tally_result.abstain;
            proposal.pro_votes_no = item.final_tally_result.no;
            proposal.pro_votes_no_with_veto =
              item.final_tally_result.no_with_veto;
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
          proposal.is_delete = false;
          proposal.pro_activity = '{"key": "activity", "value": ""}'; //tmp value
          // insert into table proposals
          try {
            await this.proposalRepository.create(proposal);
          } catch (error) {
            await this.proposalRepository.update(proposal);
            this._logger.error(null, `Proposal is already existed!`);
          }
        }
        //delete proposal failed
        const listId = data.proposals.map((i) => Number(i.proposal_id));
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
    let key: string = '';
    const params = `/cosmos/gov/v1beta1/proposals`;
    let result = await this._commonUtil.getDataAPI(rootApi, params);
    key = result.pagination.next_key;
    while (key != null) {
      const params = `/cosmos/gov/v1beta1/proposals?pagination.key=${key}`;
      let dataProposal = await this._commonUtil.getDataAPI(rootApi, params);
      key = dataProposal.pagination.next_key;
      result = [...result.proposals, ...dataProposal.proposals];
    }
    return result;
  }
}