# Sync service for Aura Network explorer
aura-explorer-sync provides data to [aura-explorer-api](https://github.com/aura-nw/aura-explorer-api) by synchronizing data from Horoscope, Cosmos LCD and saving this data in aura-explorer-api's database. At the same time, aura-explorer-sync will sync the price data of CW20 tokens priced on [coingecko](https://www.coingecko.com/en/api/documentation).

## Prerequisite
- Nodejs
- MySQL
- Redis
- Influxdb

Reference to [aura-explorer-api](https://github.com/aura-nw/aura-explorer-api)
## Getting started
### 1. Clone the repository.
```bash
https://github.com/aura-nw/aura-explorer-sync.git
```
### 2. Enter your newly-cloned folder.
```bash
cd aura-explorer-sync
```
### 3. Create Environment variables file.
```bash
cp .env-example .env
```
### 4. Install dependencies. (Make sure nodejs is installed: https://nodejs.org/en/)
```bash
npm i
```
## Running the app
```bash
# Build project
$ npm run build

# Start project
$ npm run start
```
### License.
[MIT License](./LICENSE)
