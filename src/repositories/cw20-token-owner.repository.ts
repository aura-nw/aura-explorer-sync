import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Cw20TokenOwner } from "../entities/cw20-token-owner.entity";
import { BaseRepository } from "./base.repository";

@Injectable()
export class Cw20TokenOwnerRepository extends BaseRepository<Cw20TokenOwner> {
  private readonly _logger = new Logger(Cw20TokenOwnerRepository.name);
  constructor(
    @InjectRepository(Cw20TokenOwner)
    private readonly repos: Repository<Cw20TokenOwner>,
  ) {
    super(repos);
    this._logger.log(
      '============== Constructor Cw20TokenOwner Repository ==============',
    );
  }
}