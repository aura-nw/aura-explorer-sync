import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { ENTITIES_CONFIG } from '../module.config';
import { BaseRepository } from './base.repository';

@Injectable()
export class ValidatorRepository extends BaseRepository {
  private readonly _logger = new Logger(ValidatorRepository.name);
  constructor(
    @InjectRepository(ENTITIES_CONFIG.VALIDATOR)
    private readonly repos: Repository<ObjectLiteral>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Validator Repository ==============',
    );
  }
}
