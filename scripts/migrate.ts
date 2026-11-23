/** Applies pending SQL migrations from ./drizzle using Drizzle's runtime migrator (no drizzle-kit needed at runtime). */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("[migrate] database is up to date");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
