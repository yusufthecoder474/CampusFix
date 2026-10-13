import pg from "pg";
import { readConfig } from "../src/config.js";
const config = readConfig();
const target = new URL(process.env.TEST_DATABASE_URL ?? "");
const source = new URL(config.DATABASE_URL);
const name = target.pathname.slice(1);
if (!/^[a-z][a-z0-9_]*_test$/.test(name) || target.pathname === source.pathname)
  throw new Error("Use a separate database with a name ending in _test");
for (const key of ["host", "username", "password"] as const)
  if (target[key] !== source[key])
    throw new Error(
      "Test database must use the same local server and credentials",
    );
if (!["127.0.0.1", "localhost"].includes(target.hostname))
  throw new Error("This setup helper only creates local test databases");
const client = new pg.Client({ connectionString: config.DATABASE_URL });
try {
  await client.connect();
  const found = await client.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [name],
  );
  if (!found.rowCount) await client.query(`CREATE DATABASE "${name}"`);
  console.log(
    "Separate test database available; no existing data was removed.",
  );
} finally {
  await client.end();
}
