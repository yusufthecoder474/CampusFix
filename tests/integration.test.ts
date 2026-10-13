import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { migrate } from "../scripts/migrate.js";
import { seed } from "../scripts/seed.js";
import { tokenHash, verifyPassword } from "../src/auth/password.js";

const native = process.env.CAMPUSFIX_NATIVE_TEST === "1";
const schema = "campusfix_test_" + randomUUID().replaceAll("-", "");
const origin = "http://127.0.0.1:3100";
const password = "Synthetic-test-password-2026!";
let embedded: PGlite | undefined,
  socket: PGLiteSocketServer | undefined,
  pool: pg.Pool,
  admin: pg.Client;
let app: ReturnType<typeof createApp>;
let student: { cookie: string; csrf: string },
  other: typeof student,
  coordinator: typeof student,
  technician: typeof student;
let createdId: string, privateId: string, availableId: string;
async function login(email: string) {
  const res = await request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email, password });
  expect(res.status).toBe(200);
  const header = res.headers["set-cookie"] as unknown as string[];
  return {
    cookie: header[0]!.split(";")[0]!,
    csrf: res.body.csrfToken as string,
  };
}
const authed = (identity: typeof student, path: string) =>
  request(app).get(path).set("Cookie", identity.cookie);
const post = (identity: typeof student, path: string) =>
  request(app)
    .post(path)
    .set("Cookie", identity.cookie)
    .set("Origin", origin)
    .set("X-CSRF-Token", identity.csrf);
beforeAll(async () => {
  let url = process.env.TEST_DATABASE_URL;
  if (native) {
    if (!url || !new URL(url).pathname.endsWith("_test"))
      throw new Error("Native tests require a separate *_test database");
  } else {
    embedded = await PGlite.create();
    // Ask OS for an unused port; fail safely if another process claims it before binding.
    const port = await new Promise<number>((resolve, reject) => {
      const s = createServer();
      s.on("error", reject);
      s.listen(0, "127.0.0.1", () => {
        const a = s.address();
        const n = typeof a === "object" && a ? a.port : 0;
        s.close(() => resolve(n));
      });
    });
    socket = new PGLiteSocketServer({ db: embedded, host: "127.0.0.1", port });
    await socket.start();
    url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  }
  admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  // Keep one connection in embedded mode; it is not a concurrency simulator.
  pool = new pg.Pool({
    connectionString: url,
    max: 1,
    options: `-c search_path=${schema}`,
    connectionTimeoutMillis: 10000,
  });
  // Close admin connection before pool uses the single-connection embedded backend.
  await admin.end();
  await pool.end();
  await migrate(url!, schema, "001_initial.sql");
  const legacy = new pg.Client({ connectionString: url });
  await legacy.connect();
  await legacy.query(
    `INSERT INTO "${schema}".users(id,email,display_name,role,password_hash) VALUES($1,'legacy@campusfix.test','Legacy fixture','student','unusable-test-hash')`,
    [randomUUID()],
  );
  await legacy.query(`DROP TABLE "${schema}".campusfix_migrations`);
  await legacy.end();
  await migrate(url!, schema);
  await migrate(url!, schema);
  pool = new pg.Pool({
    connectionString: url,
    max: 1,
    options: `-c search_path=${schema}`,
    connectionTimeoutMillis: 10000,
    onConnect: async (client) => {
      await client.query(`SET search_path TO "${schema}"`);
    },
  });
  const db = drizzle(pool);
  await seed(db, password);
  app = createApp(
    async () => {
      await pool.query("SELECT 1");
    },
    {
      db,
      config: readConfig({
        DATABASE_URL: url,
        NODE_ENV: "test",
        APP_ORIGIN: origin,
      }),
    },
  );
  student = await login("student1@campusfix.test");
  other = await login("student2@campusfix.test");
  coordinator = await login("coordinator@campusfix.test");
  technician = await login("technician1@campusfix.test");
  const rows = await pool.query(
    "SELECT r.id,u.email FROM maintenance_requests r JOIN users u ON u.id=r.reporter_id ORDER BY r.title",
  );
  privateId = rows.rows.find((r) => r.email === "student2@campusfix.test").id;
  availableId = rows.rows.find((r) => r.email === "student1@campusfix.test").id;
  await pool.query(
    "UPDATE maintenance_requests SET status='available' WHERE id=$1",
    [availableId],
  );
  console.log(
    `Integration engine: ${native ? "native PostgreSQL" : "PGlite WASM via pg wire protocol (NOT native PostgreSQL)"}`,
  );
}, 60000);
afterAll(async () => {
  if (pool) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
  if (socket) await socket.stop();
  if (embedded) await embedded.close();
}, 20000);
describe("authentication and PostgreSQL-backed requests", () => {
  it("adopts an existing M1 schema without losing its records", async () => {
    const r = await pool.query(
      "SELECT count(*)::int AS n FROM users WHERE email='legacy@campusfix.test'",
    );
    expect(r.rows[0].n).toBe(1);
  });
  it("stores salted password hashes and hashed session tokens", async () => {
    const u = await pool.query(
      "SELECT password_hash FROM users WHERE email='student1@campusfix.test'",
    );
    expect(u.rows[0].password_hash).not.toContain(password);
    expect(await verifyPassword(password, u.rows[0].password_hash)).toBe(true);
    const token = student.cookie.split("=")[1]!;
    const s = await pool.query(
      "SELECT token_hash FROM sessions WHERE token_hash=$1",
      [tokenHash(token)],
    );
    expect(s.rowCount).toBe(1);
    expect(s.rows[0].token_hash).not.toBe(token);
  });
  it("returns current user without credentials", async () => {
    const r = await authed(student, "/api/auth/me");
    expect(r.status).toBe(200);
    expect(r.body.user.role).toBe("student");
    expect(r.text).not.toContain("password");
  });
  it("rejects unauthenticated request reads", async () => {
    expect((await request(app).get("/api/requests")).status).toBe(401);
  });
  it("rejects fabricated sessions", async () => {
    expect(
      (
        await request(app)
          .get("/api/requests")
          .set("Cookie", "campusfix=" + "a".repeat(64))
      ).status,
    ).toBe(401);
  });
  it("creates request and history atomically", async () => {
    const r = await post(student, "/api/requests").send({
      title: "Broken window latch",
      description: "Window latch does not close securely.",
      location: "Hostel A",
    });
    expect(r.status).toBe(201);
    createdId = r.body.request.id;
    expect(r.body.request.status).toBe("reported");
    const e = await pool.query(
      "SELECT actor_id,action FROM request_events WHERE request_id=$1",
      [createdId],
    );
    expect(e.rowCount).toBe(1);
    expect(e.rows[0].action).toBe("create");
    expect(e.rows[0].actor_id).toBe(r.body.request.reporterId);
  });
  it("allows reporter retrieval", async () => {
    expect((await authed(student, "/api/requests/" + createdId)).status).toBe(
      200,
    );
  });
  it("conceals other students records", async () => {
    expect((await authed(student, "/api/requests/" + privateId)).status).toBe(
      404,
    );
  });
  it("coordinator can retrieve any request", async () => {
    expect(
      (await authed(coordinator, "/api/requests/" + privateId)).status,
    ).toBe(200);
  });
  it("technician cannot read unassigned private reported requests", async () => {
    expect(
      (await authed(technician, "/api/requests/" + privateId)).status,
    ).toBe(404);
  });
  it("technician available work omits reporter ID and description", async () => {
    const r = await authed(technician, "/api/requests/" + availableId);
    expect(r.status).toBe(200);
    expect(r.body.request).not.toHaveProperty("reporterId");
    expect(r.body.request).not.toHaveProperty("description");
  });
  it("enforces creation role on server", async () => {
    expect(
      (
        await post(coordinator, "/api/requests").send({
          title: "Valid title",
          description: "Long enough description",
          location: "Hostel A",
        })
      ).status,
    ).toBe(403);
  });
  it("rejects mass assignment", async () => {
    expect(
      (
        await post(student, "/api/requests").send({
          title: "Valid title",
          description: "Long enough description",
          location: "Hostel A",
          status: "closed",
        })
      ).status,
    ).toBe(400);
  });
  it("rejects missing CSRF token", async () => {
    expect(
      (
        await request(app)
          .post("/api/requests")
          .set("Cookie", student.cookie)
          .set("Origin", origin)
          .send({})
      ).status,
    ).toBe(403);
  });
  it("rejects cross-origin writes", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Origin", "https://evil.invalid")
          .send({})
      ).status,
    ).toBe(403);
  });
  it("rejects non-JSON writes", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Origin", origin)
          .type("form")
          .send("email=x")
      ).status,
    ).toBe(415);
  });
  it("rejects invalid UUIDs", async () => {
    expect((await authed(student, "/api/requests/not-a-uuid")).status).toBe(
      400,
    );
  });
  it("validates request boundaries", async () => {
    expect(
      (
        await post(student, "/api/requests").send({
          title: "x",
          description: "short",
          location: "A",
        })
      ).status,
    ).toBe(400);
  });
  it("filters with bounded stable pagination and scoped totals", async () => {
    const a = await authed(student, "/api/requests?limit=1&page=1");
    const b = await authed(student, "/api/requests?limit=1&page=2");
    expect(a.status).toBe(200);
    expect(a.body.items).toHaveLength(1);
    expect(a.body.items[0].id).not.toBe(b.body.items[0].id);
    const f = await authed(
      student,
      "/api/requests?status=reported&location=Hostel%20A",
    );
    expect(
      f.body.items.every(
        (r: { status: string; location: string }) =>
          r.status === "reported" && r.location === "Hostel A",
      ),
    ).toBe(true);
    const o = await authed(other, "/api/requests");
    expect(o.body.total).toBe(1);
  });
  it.each(["limit=51", "page=0", "status=invalid", "role=coordinator"])(
    "rejects query %s",
    async (q) => {
      expect((await authed(student, "/api/requests?" + q)).status).toBe(400);
    },
  );
  it("SQL injection text is treated as a filter value", async () => {
    const r = await authed(
      student,
      "/api/requests?location=" + encodeURIComponent("x' OR 1=1 --"),
    );
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
  });
  it("database rejects inconsistent assignments", async () => {
    await expect(
      embedded
        ? embedded.query(
            `UPDATE ${schema}.maintenance_requests SET status='in_progress' WHERE id=$1`,
            [createdId],
          )
        : pool.query(
            "UPDATE maintenance_requests SET status='in_progress' WHERE id=$1",
            [createdId],
          ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("database enforces reporter foreign key", async () => {
    await expect(
      embedded
        ? embedded.query(
            `UPDATE ${schema}.maintenance_requests SET reporter_id=$1 WHERE id=$2`,
            [randomUUID(), createdId],
          )
        : pool.query(
            "UPDATE maintenance_requests SET reporter_id=$1 WHERE id=$2",
            [randomUUID(), createdId],
          ),
    ).rejects.toMatchObject({ code: "23503" });
  });
  it("creation rolls back when history insert fails", async () => {
    const before = await pool.query(
      "SELECT count(*)::int AS n FROM maintenance_requests",
    );
    await pool.query(
      "ALTER TABLE request_events ADD CONSTRAINT injected_failure CHECK(action <> 'create') NOT VALID",
    );
    try {
      const r = await post(student, "/api/requests").send({
        title: "Rollback test request",
        description: "No record should remain after failure.",
        location: "Test lab",
      });
      expect(r.status).toBe(500);
    } finally {
      await pool.query(
        "ALTER TABLE request_events DROP CONSTRAINT injected_failure",
      );
    }
    const after = await pool.query(
      "SELECT count(*)::int AS n FROM maintenance_requests",
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
  it("wrong and unknown credentials share the same response", async () => {
    for (const email of ["student1@campusfix.test", "unknown@campusfix.test"]) {
      const r = await request(app)
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({ email, password: "incorrect" });
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe("INVALID_CREDENTIALS");
    }
  });
  it("logout invalidates the server-side session", async () => {
    const r = await post(other, "/api/auth/logout").send({});
    expect(r.status).toBe(204);
    expect((await authed(other, "/api/auth/me")).status).toBe(401);
  });
  it("expired sessions cannot authenticate", async () => {
    await pool.query("UPDATE sessions SET expires_at=$1 WHERE token_hash=$2", [
      new Date(0),
      tokenHash(technician.cookie.split("=")[1]!),
    ]);
    expect((await authed(technician, "/api/auth/me")).status).toBe(401);
  });
  it("sets HttpOnly SameSite cookies and rotates the current session", async () => {
    const r = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .set("Cookie", coordinator.cookie)
      .send({ email: "coordinator@campusfix.test", password });
    expect(r.status).toBe(200);
    expect((r.headers["set-cookie"] as unknown as string[])[0]!).toContain(
      "HttpOnly",
    );
    expect((r.headers["set-cookie"] as unknown as string[])[0]!).toContain(
      "SameSite=Strict",
    );
    expect((await authed(coordinator, "/api/auth/me")).status).toBe(401);
  });
  it("login rate limit returns JSON errors", async () => {
    let status = 0;
    for (let i = 0; i < 12; i++) {
      const r = await request(app)
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({});
      status = r.status;
      if (status === 429) {
        expect(r.body.error.code).toBe("LOGIN_RATE_LIMITED");
        break;
      }
    }
    expect(status).toBe(429);
  });
});
