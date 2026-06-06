FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# モノレポの場合、ワークスペースのpackage.jsonも先にコピー
# COPY packages/*/package.json ./packages/

RUN pnpm install --frozen-lockfile
RUN pnpm rebuild better-sqlite3  # ← 汎用 rebuild より明示的

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# --- ランタイムステージ ---
FROM node:22-slim
WORKDIR /app

RUN corepack enable

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
COPY env.example ./env.example
COPY routes.example.yaml ./routes.example.yaml
RUN mkdir -p data

EXPOSE 3000
CMD ["node", "dist/index.js"]