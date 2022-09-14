import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenContract } from '../entities/token-contract.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class TokenContractRepository extends BaseRepository<TokenContract> {
  private readonly _logger = new Logger(TokenContractRepository.name);
  constructor(
    @InjectRepository(TokenContract)
    private readonly repos: Repository<TokenContract>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Token Contract Repository ==============',
    );
  }
}
