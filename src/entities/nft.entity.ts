import { Column, Entity, Unique } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('nfts')
@Unique(['contract_address', 'token_id', 'is_burn'])
export class Nft extends BaseEntityIncrementId {
    @Column({ name: 'contract_address' })
    contract_address: string;

    @Column({ name: 'token_id' })
    token_id: string;

    @Column({ name: 'owner' })
    owner: string;

    @Column({ name: 'uri' })
    uri: string;

    @Column({ name: 'is_burn' })
    is_burn: boolean;

    @Column({ name: 'uri_s3' })
    uri_s3: string;
}