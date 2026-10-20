import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { readConfig } from "../src/config.js";
const tables = ["users", "maintenance_requests", "request_events", "sessions"];
async function fingerprint(client: pg.Client, schema: string) {
  const normalize = (s: string) =>
    s.replaceAll('"' + schema + '".', "").replaceAll(schema + ".", "");
  const columns = await client.query(
    "SELECT table_name,column_name,udt_name,is_nullable,column_default,is_identity FROM information_schema.columns WHERE table_schema=$1 AND table_name=ANY($2::text[]) ORDER BY table_name,ordinal_position",
    [schema, tables],
  );
  const constraints = await client.query(
    "SELECT t.relname AS table_name,c.conname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relname=ANY($2::text[]) ORDER BY t.relname,c.conname",
    [schema, tables],
  );
  return {
    columns: columns.rows.map((r) => normalize(JSON.stringify(r))),
    constraints: constraints.rows.map((r) => normalize(JSON.stringify(r))),
  };
}
export async function migrate(
  url: string,
  target = "public",
  through = "003_outbox.sql",
) {
  const migrations = ["001_initial.sql", "002_workflow.sql", "003_outbox.sql"];
  if (!migrations.includes(through))
    throw new Error("Unknown migration target");
  if (!/^[a-z][a-z0-9_]*$/.test(target))
    throw new Error("Invalid schema identifier");
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(734281)");
    await client.query(`SET LOCAL search_path TO "${target}"`);
    for (const name of migrations.slice(0, migrations.indexOf(through) + 1)) {
      const source = await readFile(
        new URL("../db/" + name, import.meta.url),
        "utf8",
      );
      const checksum = createHash("sha256").update(source).digest("hex");
      const ddl = source.replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, "");
      await client.query(
        "CREATE TABLE IF NOT EXISTS campusfix_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
      );
      const applied = await client.query(
        "SELECT checksum FROM campusfix_migrations WHERE name=$1",
        [name],
      );
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== checksum)
          throw new Error("Migration checksum mismatch");
        continue;
      }
      const existing = await client.query(
        "SELECT to_regclass('users') AS name",
      );
      if (name === "001_initial.sql" && existing.rows[0].name) {
        // Compare legacy M1 schema against the immutable migration in a throwaway schema.
        // This transaction rolls back on any mismatch; existing rows are never rewritten.
        const expected = "campusfix_verify_" + randomUUID().replaceAll("-", "");
        await client.query(`CREATE SCHEMA "${expected}"`);
        await client.query(`SET LOCAL search_path TO "${expected}"`);
        await client.query(ddl);
        const wanted = await fingerprint(client, expected);
        await client.query(`SET LOCAL search_path TO "${target}"`);
        const actual = await fingerprint(client, target);
        for (const key of ["columns", "constraints"] as const)
          for (const entry of wanted[key])
            if (!actual[key].includes(entry))
              throw new Error(
                "Existing schema differs from Milestone 1; manual review required",
              );
        await client.query(`DROP SCHEMA "${expected}" CASCADE`);
        console.log(
          "Adopted verified Milestone 1 schema; existing rows preserved",
        );
      } else {
        await client.query(ddl);
        console.log("Applied " + name);
      }
      await client.query(
        "INSERT INTO campusfix_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
if (process.argv[1]?.endsWith("migrate.ts"))
  migrate(readConfig().DATABASE_URL).catch(() => {
    console.error(
      "Migration failed. Check database credentials, migration checksum and schema compatibility; existing data was not deleted.",
    );
    process.exitCode = 1;
  });
