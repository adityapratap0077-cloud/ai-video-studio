import { defineConfig } from "prisma/config";

// NOTE: the Prisma CLI auto-loads .env in the project root,
// so process.env.DATABASE_URL is available here without dotenv.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Prisma 7 moved datasource URLs out of the schema file.
    url: process.env.DATABASE_URL ?? "file:./data/app.db",
  },
});
