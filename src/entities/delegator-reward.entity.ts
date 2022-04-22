import { Column, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('delegator_rewards')
export class DelegatorReward extends BaseEntityIncrementId {
    @Column()
    delegator_address: string;

    @Column()
    validator_address: string;

    @Column()
    amount: number;

    @Column()
    tx_hash: string;
}