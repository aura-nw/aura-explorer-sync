import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TokenTransaction } from "../entities/token-transaction.entity";
import { BaseRepository } from "./base.repository";

@Injectable()
export class TokenTransactionRepository extends BaseRepository<TokenTransaction> {
  private readonly _logger = new Logger(TokenTransactionRepository.name);
  constructor(
    @InjectRepository(TokenTransaction)
    private readonly repos: Repository<TokenTransaction>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Token Transaction Repository ==============',
    );
  }
}