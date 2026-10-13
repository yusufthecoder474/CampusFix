import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
export function connectDatabase(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    connectionTimeoutMillis: 3000,
    query_timeout: 5000,
  });
  pool.on("error", () =>
    console.error(JSON.stringify({ event: "database_pool_error" })),
  );
  return { pool, db: drizzle(pool) };
}
export type Database = ReturnType<typeof connectDatabase>["db"];
