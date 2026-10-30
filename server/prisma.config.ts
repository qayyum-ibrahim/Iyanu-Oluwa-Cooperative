import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // The Prisma CLI uses the direct address; the app uses the pooled DATABASE_URL (src/db.ts, D-118).
    url: process.env.DIRECT_URL ?? "",
  },
});
