import { Column, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('cw20_token_owners')
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