import { Client, Repository, Schema } from "redis-om";
import { TokensEnity } from "../enities/token.entity";
import { Injectable } from "@nestjs/common";
import { ENV_CONFIG } from "../../shared/services/config.service";

@Injectable()
export class TokenRepository {
    private client: Client;
    private repository: Repository<TokensEnity>;

    async connectToServer() {
        const redisURL = `redis://${ENV_CONFIG.REDIS.USERNAME}:${ENV_CONFIG.REDIS.PASSWORD}@${ENV_CONFIG.REDIS.HOST}:${ENV_CONFIG.REDIS.PORT}`;
        this.client = new Client();
        await this.client.open(redisURL);

        //Test connect
        const ping = await this.client.execute(['PING'])
        console.log(`Test connect redis server: ${ping}`);

        this.repository = this.client.fetchRepository(this.createSchema());
    }

    private createSchema() {
        const schema = new Schema(TokensEnity, {
            coin_id: { type: 'string' },
            tokenName: { type: 'string' },
            contract_address: { type: 'string' },
            description: { type: 'string' },
            image: { type: 'string' },
            max_supply: { type: 'string' },
            current_price: { type: 'number', sortable: true },
            price_change_percentage_24h: { type: 'number', sortable: true },
            total_volume: { type: 'number' },
            circulating_supply: { type: 'number', sortable: true },
            holders: { type: 'number', sortable: true },
            holders_change_percentage_24h: { type: 'number', sortable: true },
        });
        return schema;
    }

    async save(data) {
        const token = this.repository.createEntity(data);
        return await this.repository.save(token);
    }

    async search(dataSearch: string, field: string, order: 'ASC' | 'DESC', limit: number, offset: number) {
        return await this.repository.search()
            .where('tokenName')
            .contains(dataSearch)
            .or('contract_address')
            .contains(dataSearch)
            .sortBy(field, order)
            .return.page(offset, limit);
    }
}