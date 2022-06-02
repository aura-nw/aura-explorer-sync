import { Column, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('smart_contracts')
export class SmartContract extends BaseEntityIncrementId {
    @Column({ name: 'height' })
    height: number;

    @Column({ name: 'code_id' })
    code_id: number;

    @Column({ name: 'token_id' })
    token_id: number;

    @Column({ name: 'contract_name'})
    contract_name: string;

    @Column({ name: 'contract_address'})
    contract_address: string;

    @Column({ name: 'creator_address'})
    creator_address: string;

    @Column({ name: 'contract_hash'})
    contract_hash: string;

    @Column({ name: 'tx_hash'})
    tx_hash: string;

    @Column({ name: 'url'})
    url: string;

    @Column({ name: 'instantiate_msg_schema'})
    instantiate_msg_schema: string;

    @Column({ name: 'query_msg_schema'})
    query_msg_schema: string;

    @Column({ name: 'execute_msg_schema'})
    execute_msg_schema: string;

    @Column({ name: 'contract_match'})
    contract_match: string;

    @Column({ name: 'contract_verification'})
    contract_verification: string;

    @Column({ name: 'compiler_version'})
    compiler_version: string;
}