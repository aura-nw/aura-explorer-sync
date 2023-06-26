export class TokenCW20Dto {
  coinId: string;
  usd: number;
  total_volume: number;
  last_updated: string;
  timestamp: string;
  current_price: number;
  market_cap_rank: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  circulating_supply: number;
  type: string;
  max_supply: number;
  previous_holder: number;
  current_holder: number;
  percent_holder: number;
}
