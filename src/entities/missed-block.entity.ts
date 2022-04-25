import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity('missed_block')
export class MissedBlock {
  @PrimaryColumn({ name: 'validator_address' })
  validator_address: string;

  @PrimaryColumn({ name: 'height' })
  height: number;

  @Column({ name: 'timestamp' })
  timestamp: Date;
}