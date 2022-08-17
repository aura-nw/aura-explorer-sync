import { Injectable } from "@nestjs/common";
import * as redis from "redis";
import { ENV_CONFIG } from "../shared/services/config.service";
// const redis = require('redis');

@Injectable()
export class RedisUtil {

    private redisClient;

    constructor() {
        const redisURL = { url: `redis://:${ENV_CONFIG.REDIS.PASSWORD}@${ENV_CONFIG.REDIS.HOST}:${ENV_CONFIG.REDIS.PORT}` };
        this.redisClient = redis.createClient(redisURL);
       
    }
    

    public convertDateToString(date: Date) {
        const timestamp = new Date();
        timestamp.setSeconds(0, 0);
        return timestamp.toISOString();

    }

    public async connect() {
        try {
          
            if (!this.redisClient.isOpen) {
                await this.redisClient.connect();               
            }
            // await this.redisClient.auth('h', ENV_CONFIG.REDIS.PASSWORD);
            console.log('Auth complete...');
            

        } catch (err) {
            console.log(err);
        }
    }
    public async setValue(key: string, data: any) {
        await this.redisClient.set(key, JSON.stringify(data));
    }

    public async getValue(key: string) {


        // const values = this.redisClient.getAsync(key).then((reply) =>{
        //     return reply;
        // });
        // return Promise.all([values]);
    }
}