import { Column, Entity } from "typeorm";
import { BaseEntityIncrementId } from "./base/base.entity";

@Entity('block_sync_error')
export class BlockSyncError extends BaseEntityIncrementId {
    @Column()
    height: number;

    @Column()
    block_hash: string;
}