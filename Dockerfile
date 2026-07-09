# Copyright (c) Microsoft Corporation.
# Licensed under the MIT License.

FROM node:20-slim AS build
WORKDIR /app

# Corepack is used to manage package manager versions
RUN corepack enable

COPY package.json .npmrc* ./
RUN corepack npm install --no-audit --no-fund --ignore-scripts

COPY . .
RUN corepack npm run build

FROM node:20-slim
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/http-server.js"]
