import { Column, Entity, Unique } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('cw20_token_owners')
@Unique(['contract_address', 'owner'])
export class Cw20TokenOwner extends BaseEntityIncrementId {
    @Column({ name: 'contract_address' })
    contract_address: string;

    @Column({ name: 'owner' })
    owner: string;

    @Column({ name: 'balance' })
    balance: number;

    @Column({ name: 'percent_hold' })
    percent_hold: number;
}