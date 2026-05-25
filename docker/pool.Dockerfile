# Stratum V1 pool server.
#
# Two-stage build: install + compile in a heavyweight builder, then ship a
# slim runtime image with only the compiled `dist/` and production deps.

FROM node:20-bookworm-slim AS builder
WORKDIR /app

# We need workspace metadata + the packages the pool depends on at build time.
COPY package.json package-lock.json ./
COPY pool/package.json pool/
RUN mkdir -p frontend backend mining recovery tx-engine ai-engine miner \
 && for d in frontend backend mining recovery tx-engine ai-engine miner; do \
        printf '{"name":"@btc-platform/%s","version":"0.1.0","private":true}\n' "$d" > "$d/package.json"; \
    done
RUN npm ci --include=dev --ignore-scripts

COPY pool/ pool/
RUN npm run build -w pool

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN useradd -r -m -u 1000 pool

COPY --from=builder --chown=pool:pool /app/pool/dist ./pool/dist
COPY --from=builder --chown=pool:pool /app/pool/package.json ./pool/package.json
COPY --from=builder --chown=pool:pool /app/package.json ./package.json
COPY --from=builder --chown=pool:pool /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=pool:pool /app/node_modules ./node_modules

USER pool
EXPOSE 3333 3334
CMD ["node", "pool/dist/index.js"]
