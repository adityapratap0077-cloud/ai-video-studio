import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

declare global {
  // eslint-disable-next-line no-var
  var __aiStudioPrisma: PrismaClient | undefined;
}

/** Production default: file:./data/app.db (override with DATABASE_URL). */
export const DEFAULT_DATABASE_URL = 'file:./data/app.db';

function resolveSqliteUrl(): string {
  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const filePart = url.startsWith('file:') ? url.slice('file:'.length) : url;
  const absolute = path.resolve(process.cwd(), filePart);
  // better-sqlite3 cannot create missing parent dirs — make sure ./data exists.
  mkdirSync(path.dirname(absolute), { recursive: true });
  return `file:${absolute}`;
}

function createClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: resolveSqliteUrl() });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient =
  globalThis.__aiStudioPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__aiStudioPrisma = db;
}
