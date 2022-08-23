import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Nft } from "../entities/nft.entity";
import { BaseRepository } from "./base.repository";

@Injectable()
export class NftRepository extends BaseRepository<Nft> {
  private readonly _logger = new Logger(NftRepository.name);
  constructor(
    @InjectRepository(Nft)
    private readonly repos: Repository<Nft>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Nft Repository ==============',
    );
  }
}