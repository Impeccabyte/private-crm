/**
 * Lazy Postgres client: nothing connects until the first query, so `next build` never needs a database.
 * Shared by the Next.js server, the worker, migrations and the seed (no `server-only` import here on purpose).
 */
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;
const globalForDb = globalThis as unknown as { __crmSql?: postgres.Sql; __crmDb?: DB };

export function sql(): postgres.Sql {
  if (!globalForDb.__crmSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__crmSql = postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 10), prepare: false });
  }
  return globalForDb.__crmSql;
}

export function getDb(): DB {
  if (!globalForDb.__crmDb) globalForDb.__crmDb = drizzle(sql(), { schema });
  return globalForDb.__crmDb;
}

/** Proxy so call sites can `import { db } from "@/db"` without connecting at import time. */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export { schema };
