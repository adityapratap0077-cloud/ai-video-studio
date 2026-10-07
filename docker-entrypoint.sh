#!/bin/sh
# Container entrypoint: apply Prisma migrations, then start the server.
set -e

mkdir -p /app/data

if [ -z "$ENCRYPTION_KEY" ]; then
  echo "ERROR: ENCRYPTION_KEY is not set." >&2
  echo "Generate one with: openssl rand -hex 32" >&2
  echo "Then pass it via --env-file .env or the environment." >&2
  exit 1
fi

echo "Applying database migrations..."
pnpm exec prisma migrate deploy

echo "Starting AI Video Studio..."
exec node server.js
