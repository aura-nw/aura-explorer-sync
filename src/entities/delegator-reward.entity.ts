import { Column, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('delegator_rewards')
export class DelegatorReward extends BaseEntityIncrementId {
    @Column({ name: 'delegator_address' })
    delegator_address: string;

    @Column({ name: 'validator_address' })
    validator_address: string;

    @Column({ name: 'amount' })
    amount: number;

    @Column({ name: 'tx_hash' })
    tx_hash: string;
}