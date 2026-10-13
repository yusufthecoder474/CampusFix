import { createServer } from "node:http";
import { attachRealtime } from "./realtime.js";
import { resolve } from "node:path";
import { readConfig } from "./config.js";
import { connectDatabase } from "./db/client.js";
import { createApp } from "./app.js";
async function main() {
  const config = readConfig();
  const { pool, db } = connectDatabase(config.DATABASE_URL);
  try {
    await pool.query("SELECT 1 FROM users LIMIT 1");
  } catch {
    await pool.end();
    throw new Error(
      "Database unavailable or unmigrated. Check DATABASE_URL, credentials, port and npm run migrate.",
    );
  }
  const server = createServer(
    createApp(
      async () => {
        await pool.query("SELECT 1");
      },
      {
        db,
        config,
        webRoot: resolve("dist/web"),
        publish: (...args) => realtime.publish(...args),
      },
    ),
  );
  const realtime = attachRealtime(server, db, config);
  server.listen(config.PORT, config.HOST, () =>
    console.log(
      JSON.stringify({
        event: "listening",
        host: config.HOST,
        port: config.PORT,
      }),
    ),
  );
  server.on("error", async (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "Port already in use. Change PORT and APP_ORIGIN together; do not stop unrelated processes."
        : "Server failed to start",
    );
    await pool.end();
    process.exitCode = 1;
  });
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      const timeout = setTimeout(() => process.exit(1), 10000);
      timeout.unref();
      void realtime
        .close()
        .then(() => pool.end())
        .finally(() => clearTimeout(timeout));
    });
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Startup failed");
  process.exitCode = 1;
});
