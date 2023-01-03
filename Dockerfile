FROM node:16.10 as build-stage

ARG PORT=3000

ARG MAX_OLD_SPACE_SIZE=4096
ENV NODE_OPTIONS=--max-old-space-size=${MAX_OLD_SPACE_SIZE}

RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app

COPY . .
RUN npm install --legacy-peer-deps && npm cache clean --force
RUN npm run build

EXPOSE $PORT

CMD [ "npm", "run", "start:prod" ]
