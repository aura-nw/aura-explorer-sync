import { Processor } from "@nestjs/bull";
import { createClient } from "redis";
import { ENV_CONFIG } from "../shared/services/config.service";

@Processor('audio')
export class SyncTokenConsumers{

    private redisClient = createClient({ url: `redis://${ENV_CONFIG.REDIS.USERNAME}@${ENV_CONFIG.REDIS.HOST}:${ENV_CONFIG.REDIS.PORT}` });


    private syncTokenPrice() {
        this.setValueForRedis({});
    }

    private syncTokenVolumn() {
        this.setValueForRedis({});
    }

    private syncTokenHolder() {
        this.setValueForRedis({});
    }

    private convertDateToString(date: Date) {
        const timestamp = new Date();
        timestamp.setSeconds(0, 0);
        return timestamp.toISOString();
    }

    private setValueForRedis(data: any) {
        this.redisClient.set(this.convertDateToString(new Date()), JSON.stringify(data));
    }
}