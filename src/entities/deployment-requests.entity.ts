import { Column, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('deployment_requests')
export class DeploymentRequests extends BaseEntityIncrementId {
    @Column({ name: 'request_id' })
    request_id: number;
    
    @Column({ name: 'name' })
    name: string;

    @Column({ name: 'email' })
    email: string;

    @Column({ name: 'contract_description' })
    contract_description: string;

    @Column({ name: 'project_name' })
    project_name: string;

    @Column({ name: 'official_project_website' })
    official_project_website: string;

    @Column({ name: 'official_project_email' })
    official_project_email: string;

    @Column({ name: 'project_sector' })
    project_sector: string;

    @Column({ name: 'whitepaper' })
    whitepaper: string;

    @Column({ name: 'github' })
    github: string;

    @Column({ name: 'telegram' })
    telegram: string;

    @Column({ name: 'discord' })
    discord: string;

    @Column({ name: 'facebook' })
    facebook: string;

    @Column({ name: 'twitter' })
    twitter: string;

    @Column({ name: 'euphoria_code_id' })
    euphoria_code_id: number;

    @Column({ name: 'mainnet_code_id' })
    mainnet_code_id: number;

    @Column({ name: 'contract_hash' })
    contract_hash: string;

    @Column({ name: 'url' })
    url: string;

    @Column({
        name: 'instantiate_msg_schema',
        type: 'text',
    })
    instantiate_msg_schema: string;

    @Column({
        name: 'query_msg_schema',
        type: 'text',
    })
    query_msg_schema: string;

    @Column({
        name: 'execute_msg_schema',
        type: 'text',
    })
    execute_msg_schema: string;

    @Column({ name: 'compiler_version' })
    compiler_version: string;

    @Column({ name: 'status' })
    status: string;

    @Column({ name: 'reason' })
    reason: string;
}