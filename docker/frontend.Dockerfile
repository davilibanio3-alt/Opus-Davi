FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY tx-engine/package.json tx-engine/
COPY recovery/package.json recovery/
COPY ai-engine/package.json ai-engine/
COPY frontend/package.json frontend/
COPY mining/package.json mining/
COPY backend/package.json backend/

RUN apk add --no-cache python3 make g++ \
 && npm install --workspaces --include-workspace-root

COPY tx-engine tx-engine
COPY recovery recovery
COPY ai-engine ai-engine
COPY frontend frontend

RUN npm run build -w tx-engine -w recovery -w ai-engine \
 && npm run build -w frontend

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/frontend/.next /app/frontend/.next
COPY --from=build /app/frontend/public /app/frontend/public
COPY --from=build /app/frontend/package.json /app/frontend/
COPY --from=build /app/frontend/next.config.mjs /app/frontend/
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/

EXPOSE 3000
CMD ["npm", "run", "start", "-w", "frontend"]
