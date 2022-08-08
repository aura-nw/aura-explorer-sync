import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Validator } from '../entities';
import { BaseRepository } from './base.repository';

@Injectable()
export class ValidatorRepository extends BaseRepository<Validator> {
  private readonly _logger = new Logger(ValidatorRepository.name);
  constructor(
    @InjectRepository(Validator)
    private readonly repos: Repository<Validator>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Validator Repository ==============',
    );
  }
}
