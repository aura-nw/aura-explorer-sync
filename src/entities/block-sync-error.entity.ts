import { Column, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('block_sync_error')
export class BlockSyncError extends BaseEntityIncrementId {
    @Column({ name: 'height' })
    height: number;

    @Column({ name: 'block_hash' })
    block_hash: string;

    @Column()
    status: string;

    @Column({ type: 'text' , nullable: true})
    message: string;

    @Column({ name: 'retry_times' })
    retry_times: number;
}