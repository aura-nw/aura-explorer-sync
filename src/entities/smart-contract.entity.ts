import { Column, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('smart_contracts')
export class SmartContract extends BaseEntityIncrementId {
    @Column({ name: 'contract_address'})
    contract_address: string;

    @Column({ name: 'creator_address'})
    creator_address: string;

    @Column({ name: 'schema'})
    schema: string;

    @Column({ name: 'url'})
    url: string;
}