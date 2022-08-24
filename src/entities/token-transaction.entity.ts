import { Column, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('token_transactions')
export class TokenTransaction extends BaseEntityIncrementId {
    @Column({ name: 'tx_hash' })
    tx_hash: string;

    @Column({ name: 'contract_address' })
    contract_address: string;

    @Column({ name: 'token_id' })
    token_id: string;

    @Column({ name: 'transaction_type' })
    transaction_type: string;
}