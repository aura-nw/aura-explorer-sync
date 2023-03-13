import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueInfo } from '../entities/queue-info.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class QueueInfoRepository extends BaseRepository<QueueInfo> {
  private readonly _logger = new Logger(QueueInfoRepository.name);
  constructor(
    @InjectRepository(QueueInfo)
    private readonly repos: Repository<QueueInfo>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Queue Info Repository ==============',
    );
  }
}
