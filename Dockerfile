# AI Video Studio — multi-stage Docker build (pnpm).
#
#   docker build -t ai-video-studio .
#   docker run --env-file .env -p 3000:3000 -v ./data:/app/data ai-video-studio
#
# The runner stage ships:
#   - the Next.js standalone server (.next/standalone/server.js)
#   - the full node_modules (needed for `prisma migrate deploy` at boot)
#   - the prisma/ directory (migrations applied on every container start)
#   - /usr/bin/ffmpeg (video assembly) via apt
# SQLite + generated assets live in /app/data (mount a volume!).

# ---------------------------------------------------------------- deps
FROM node:22-slim AS deps
# better-sqlite3 needs build tools only when no prebuilt binary matches;
# keep them here so the runner image stays lean.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------- builder
FROM node:22-slim AS builder
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate
RUN pnpm build

# ---------------------------------------------------------------- runner
FROM node:22-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL="file:./data/app.db"

# Full node_modules: prisma CLI must be present at runtime for migrations.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
# Next.js standalone output.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p /app/data

VOLUME ["/app/data"]
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
