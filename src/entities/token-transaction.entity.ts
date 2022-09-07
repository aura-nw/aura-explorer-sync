import { Column, Entity, Unique } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('token_transactions')
@Unique(['contract_address'])
export class TokenTransaction extends BaseEntityIncrementId {
    @Column({ name: 'tx_hash' })
    tx_hash: string;

    @Column({ name: 'contract_address' })
    contract_address: string;

    @Column({ name: 'token_id' })
    token_id: string;

    @Column({ name: 'transaction_type' })
    transaction_type: string;

    @Column({ name: 'from_address' })
    from_address: string;

    @Column({ name: 'to_address' })
    to_address: string;

    @Column({ name: 'sender' })
    sender: string;

    @Column({ name: 'amount' })
    amount: number;

    @Column({ name: 'height' })
    height: number;
}