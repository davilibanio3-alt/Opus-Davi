FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Install deps using the workspace layout
COPY package.json package-lock.json* ./
COPY tx-engine/package.json tx-engine/
COPY recovery/package.json recovery/
COPY mining/package.json mining/
COPY ai-engine/package.json ai-engine/
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN apk add --no-cache python3 make g++ \
 && npm install --omit=dev --workspaces --include-workspace-root \
 && apk del python3 make g++ || true

# Build TS sources
COPY tx-engine tx-engine
COPY recovery recovery
COPY mining mining
COPY ai-engine ai-engine
COPY backend backend

RUN npm install -D typescript --workspaces --include-workspace-root \
 && npm run build -w tx-engine -w recovery -w mining -w ai-engine -w backend

EXPOSE 8787
CMD ["node", "backend/dist/server.js"]
