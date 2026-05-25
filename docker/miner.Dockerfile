# CPU miner client.

FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY miner/package.json miner/
RUN mkdir -p frontend backend mining recovery tx-engine ai-engine pool \
 && for d in frontend backend mining recovery tx-engine ai-engine pool; do \
        printf '{"name":"@btc-platform/%s","version":"0.1.0","private":true}\n' "$d" > "$d/package.json"; \
    done
RUN npm ci --include=dev --ignore-scripts

COPY miner/ miner/
RUN npm run build -w miner

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN useradd -r -m -u 1000 miner

COPY --from=builder --chown=miner:miner /app/miner/dist ./miner/dist
COPY --from=builder --chown=miner:miner /app/miner/package.json ./miner/package.json
COPY --from=builder --chown=miner:miner /app/package.json ./package.json

USER miner
CMD ["node", "miner/dist/index.js"]
