import { createServer } from "node:net";
import { readConfig } from "../src/config.js";
import { connectDatabase } from "../src/db/client.js";
try {
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw new Error("Use Node.js 24 LTS.");
  const config = readConfig();
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error("API port occupied: change PORT and APP_ORIGIN together."),
      ),
    );
    server.listen(config.PORT, config.HOST, () =>
      server.close(() => resolve()),
    );
  });
  const { pool } = connectDatabase(config.DATABASE_URL);
  try {
    await pool.query("SELECT 1 FROM users LIMIT 1");
    await pool.query("SELECT version FROM maintenance_requests LIMIT 1");
    await pool.query("SELECT request_version FROM request_events LIMIT 1");
  } catch {
    throw new Error(
      "Database connection/schema check failed. Check Docker health, credentials, DB_PORT, DATABASE_URL and migrations.",
    );
  } finally {
    await pool.end();
  }
  console.log(
    "Node, configuration, API port and database schema checks passed.",
  );
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
