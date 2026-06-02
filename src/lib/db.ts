import { Pool } from "pg";

/**
 * Pool PostgreSQL partagé (singleton via globalThis pour survivre au HMR de Next).
 * Lit la connexion depuis DATABASE_URL — mêmes credentials que Prisma.
 */
const globalForPg = globalThis as unknown as { pgPool: Pool | undefined };

export const db =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = db;
}
