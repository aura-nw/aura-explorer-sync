import { CONTRACT_TYPE } from "../common/constants/app.constant";
import { Column, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('smart_contract_codes')
export class SmartContractCode extends BaseEntityIncrementId {
    @Column({ name: 'code_id'})
    code_id: number;

    @Column({
        name: 'type',
        type: 'enum',
        enum: CONTRACT_TYPE
    })
    type: CONTRACT_TYPE;

    @Column({ name: 'result'})
    result: string;

    @Column({ name: 'creator'})
    creator: string;
}