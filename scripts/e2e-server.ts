import { createServer as createHttpServer } from "node:http";
import { attachRealtime } from "../src/realtime.js";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";
const native = process.env.CAMPUSFIX_E2E_NATIVE === "1";
const port = Number(process.env.E2E_PORT ?? 4310);
let engine: PGlite | undefined, socket: PGLiteSocketServer | undefined;
let url = process.env.TEST_DATABASE_URL;
if (native) {
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("Native E2E requires a separate *_test database");
} else {
  engine = await PGlite.create();
  const dbPort = await new Promise<number>((ok, no) => {
    const s = createServer();
    s.once("error", no);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      s.close(() => ok(typeof a === "object" && a ? a.port : 0));
    });
  });
  socket = new PGLiteSocketServer({
    db: engine,
    host: "127.0.0.1",
    port: dbPort,
  });
  await socket.start();
  url = `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres`;
}
const schema = "campusfix_e2e_" + randomUUID().replaceAll("-", "");
const admin = new pg.Client({ connectionString: url });
await admin.connect();
await admin.query(`CREATE SCHEMA "${schema}"`);
await admin.end();
await migrate(url!, schema);
const pool = new pg.Pool({
  connectionString: url,
  max: native ? 5 : 1,
  onConnect: async (client) => {
    await client.query(`SET search_path TO "${schema}"`);
  },
});
const db = drizzle(pool);
await seed(db, "Browser-synthetic-password-2026!");
const rows = await pool.query(
  "SELECT id FROM users WHERE email='student1@campusfix.test'",
);
const reporter = rows.rows[0].id;
// Preserve M3 read-only fixture; new workflow tests exercise real action routes.
for (let i = 0; i < 12; i++)
  await pool.query(
    "INSERT INTO maintenance_requests(id,reporter_id,title,description,location,status) VALUES($1,$2,$3,$4,'Test wing','reported')",
    [
      randomUUID(),
      reporter,
      `Fixture request ${i + 1}`,
      "Synthetic browser test fixture.",
    ],
  );
await pool.query(
  "UPDATE maintenance_requests SET status='available' WHERE title='Ceiling fan not turning'",
);
const config = readConfig({
  DATABASE_URL: url,
  NODE_ENV: "test",
  PORT: String(port),
  APP_ORIGIN: `http://127.0.0.1:${port}`,
});
const server = createHttpServer(
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
server.listen(port, "127.0.0.1");
server.on("error", () => {
  console.error(
    "E2E port unavailable; choose E2E_PORT. No existing process will be stopped.",
  );
  void stop();
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await realtime.close();
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
  await socket?.stop();
  await engine?.close();
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void stop().then(() => process.exit(0));
  });
console.log(
  `E2E engine: ${native ? "native PostgreSQL" : "PGlite WASM, not native PostgreSQL"}`,
);
