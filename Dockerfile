FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

# Install build dependencies for better-sqlite3
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM base AS runtime
# Install runtime dependencies for better-sqlite3 (smaller than build deps)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
# Install dependencies including devDependencies temporarily for better-sqlite3 rebuild
RUN pnpm install --frozen-lockfile && \
    # Rebuild better-sqlite3 for production
    npm rebuild better-sqlite3 --build-from-source && \
    # Remove devDependencies
    pnpm prune --prod
COPY --from=build /app/dist ./dist
# Runtime configuration is provided from the host via docker compose.
COPY env.example ./env.example
COPY routes.example.yaml ./routes.example.yaml
# Create data directory for SQLite database
RUN mkdir -p data
CMD ["node", "dist/index.js"]
