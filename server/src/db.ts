import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

// PostgreSQL through node-postgres (D-117). A "schema" parameter in the address picks the schema, as
// the Prisma CLI reads it; the tests use one schema per test file (step E.2b). The search path is set
// too, so raw SQL finds the same tables.
export function createPrismaClient(url: string): PrismaClient {
  const schema = new URL(url).searchParams.get("schema");
  const adapter = schema
    ? new PrismaPg({ connectionString: url, options: `-c search_path="${schema}"` }, { schema })
    : new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}
