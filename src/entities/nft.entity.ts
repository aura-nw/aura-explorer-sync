import { Column, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('nfts')
export class Nft extends BaseEntityIncrementId {
    @Column({ name: 'contract_address' })
    contract_address: string;

    @Column({ name: 'token_id' })
    token_id: string;

    @Column({ name: 'owner' })
    owner: string;

    @Column({ name: 'uri' })
    uri: string;
}