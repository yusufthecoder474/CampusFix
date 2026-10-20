import { createServer as createHttpServer } from "node:http";
import { io as connectSocket, type Socket } from "socket.io-client";
import { attachRealtime } from "../src/realtime.js";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import request from "supertest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { migrate } from "../scripts/migrate.js";
import { seed } from "../scripts/seed.js";
const native = process.env.CAMPUSFIX_NATIVE_TEST === "1";
const schema = "campusfix_workflow_" + randomUUID().replaceAll("-", "");
const origin = "http://127.0.0.1:3100",
  password = "Workflow-synthetic-2026!";
let url: string,
  pool: pg.Pool,
  engine: PGlite | undefined,
  socket: PGLiteSocketServer | undefined;
let app: ReturnType<typeof createApp>;
type Identity = { cookie: string; csrf: string; id: string };
let student: Identity,
  other: Identity,
  coordinator: Identity,
  coordinator2: Identity,
  tech: Identity,
  tech2: Identity;
const raceEvidence: unknown[] = [];
let live: ReturnType<typeof attachRealtime>,
  liveServer: ReturnType<typeof createHttpServer>,
  liveURL: string;
const clients: Socket[] = [];
let rejectedUpgradePreserved = false;
function makeApp() {
  return createApp(
    async () => {
      await pool.query("SELECT 1");
    },
    {
      publish: (...args) => live?.publish(...args) ?? Promise.resolve(),
      db: drizzle(pool),
      config: readConfig({
        DATABASE_URL: url,
        NODE_ENV: "test",
        APP_ORIGIN: origin,
      }),
    },
  );
}
const get = (who: Identity, path: string) =>
  request(app).get(path).set("Cookie", who.cookie);
const post = (who: Identity, path: string) =>
  request(app)
    .post(path)
    .set("Cookie", who.cookie)
    .set("Origin", origin)
    .set("X-CSRF-Token", who.csrf);
async function login(email: string) {
  const r = await request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email, password });
  expect(r.status).toBe(200);
  return {
    cookie: (r.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!,
    csrf: r.body.csrfToken,
    id: r.body.user.id,
  };
}
async function create() {
  const r = await post(student, "/api/requests").send({
    title: "Workflow fixture",
    description: "Synthetic maintenance report.",
    location: "Workflow lab",
  });
  expect(r.status).toBe(201);
  return r.body.request as { id: string; version: number; status: string };
}
const action = (who: Identity, id: string, body: object) =>
  post(who, `/api/requests/${id}/actions`).send(body);
async function available() {
  const r = await create();
  expect(
    (await action(coordinator, r.id, { action: "triage", expectedVersion: 0 }))
      .status,
  ).toBe(200);
  return r.id;
}
async function assigned() {
  const id = await available();
  expect(
    (
      await action(coordinator, id, {
        action: "assign",
        expectedVersion: 1,
        technicianId: tech.id,
      })
    ).status,
  ).toBe(200);
  return id;
}
async function resolved() {
  const id = await assigned();
  expect(
    (
      await action(tech, id, {
        action: "resolve",
        expectedVersion: 2,
        note: "Replaced damaged switch.",
      })
    ).status,
  ).toBe(200);
  return id;
}
beforeAll(async () => {
  let candidate = process.env.TEST_DATABASE_URL;
  if (native) {
    if (!candidate || !new URL(candidate).pathname.endsWith("_test"))
      throw new Error("Separate *_test database required");
  } else {
    engine = await PGlite.create();
    const port = await new Promise<number>((ok, no) => {
      const s = createServer();
      s.once("error", no);
      s.listen(0, "127.0.0.1", () => {
        const a = s.address();
        s.close(() => ok(typeof a === "object" && a ? a.port : 0));
      });
    });
    socket = new PGLiteSocketServer({ db: engine, host: "127.0.0.1", port });
    await socket.start();
    candidate = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  }
  url = candidate!;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.end();
  await migrate(url, schema, "001_initial.sql");
  const legacy = new pg.Client({ connectionString: url });
  await legacy.connect();
  await legacy.query(`SET search_path TO "${schema}"`);
  const owner = randomUUID(),
    record = randomUUID();
  await legacy.query(
    "INSERT INTO users(id,email,display_name,role,password_hash) VALUES($1,'upgrade@campusfix.test','Upgrade fixture','student','unusable-hash')",
    [owner],
  );
  await legacy.query(
    "INSERT INTO maintenance_requests(id,reporter_id,title,description,location) VALUES($1,$2,'Preserved M3 report','Existing report must survive upgrade.','Legacy lab')",
    [record, owner],
  );
  await legacy.query(
    "INSERT INTO request_events(request_id,actor_id,action,next_status) VALUES($1,$2,'create','reported')",
    [record, owner],
  );
  await legacy.end();
  await migrate(url, schema);
  await migrate(url, schema);
  // A separate deliberately incompatible M3 fixture verifies all-or-nothing DDL.
  const incompatible = schema + "_bad";
  const bad = new pg.Client({ connectionString: url });
  await bad.connect();
  await bad.query(`CREATE SCHEMA "${incompatible}"`);
  await bad.end();
  await migrate(url, incompatible, "001_initial.sql");
  const before = new pg.Client({ connectionString: url });
  await before.connect();
  await before.query(`SET search_path TO "${incompatible}"`);
  const badUser = randomUUID(),
    badRequest = randomUUID();
  await before.query(
    "INSERT INTO users(id,email,display_name,role,password_hash) VALUES($1,'invalid@campusfix.test','Invalid old assignee','student','unusable-hash')",
    [badUser],
  );
  await before.query(
    "INSERT INTO maintenance_requests(id,reporter_id,assignee_id,title,description,location,status) VALUES($1,$2,$2,'Old invalid role','Existing report needs review.','Old lab','in_progress')",
    [badRequest, badUser],
  );
  await before.end();
  await expect(migrate(url, incompatible)).rejects.toThrow();
  const after = new pg.Client({ connectionString: url });
  await after.connect();
  const preserved = await after.query(
    `SELECT id FROM "${incompatible}".maintenance_requests WHERE id=$1`,
    [badRequest],
  );
  const columns = await after.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='maintenance_requests' AND column_name='version'",
    [incompatible],
  );
  rejectedUpgradePreserved = preserved.rowCount === 1 && columns.rowCount === 0;
  await after.query(`DROP SCHEMA "${incompatible}" CASCADE`);
  await after.end();
  pool = new pg.Pool({
    connectionString: url,
    max: native ? 5 : 1,
    application_name: schema,
    connectionTimeoutMillis: 10000,
    onConnect: async (client) => {
      await client.query(`SET search_path TO "${schema}"`);
    },
  });
  await seed(drizzle(pool), password);
  await pool.query(
    "INSERT INTO users(id,email,display_name,role,password_hash) SELECT $1,'coordinator2@campusfix.test','Second coordinator','coordinator',password_hash FROM users WHERE role='coordinator' LIMIT 1",
    [randomUUID()],
  );
  app = makeApp();
  student = await login("student1@campusfix.test");
  other = await login("student2@campusfix.test");
  coordinator = await login("coordinator@campusfix.test");
  coordinator2 = await login("coordinator2@campusfix.test");
  tech = await login("technician1@campusfix.test");
  tech2 = await login("technician2@campusfix.test");
  liveServer = createHttpServer(makeApp());
  live = attachRealtime(
    liveServer,
    drizzle(pool),
    readConfig({ DATABASE_URL: url, NODE_ENV: "test", APP_ORIGIN: origin }),
  );
  await new Promise<void>((ok) => liveServer.listen(0, "127.0.0.1", ok));
  const address = liveServer.address();
  liveURL = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
}, 60000);
beforeEach(() => {
  app = makeApp();
});
afterAll(async () => {
  try {
    for (const socket of clients) socket.disconnect();
    await live?.close();
    if (native) {
      await mkdir("docs/evidence", { recursive: true });
      await writeFile(
        "docs/evidence/m5-native-concurrency.json",
        JSON.stringify(
          { engine: "native PostgreSQL", scenarios: raceEvidence },
          null,
          2,
        ) + "\n",
      );
    }
  } finally {
    if (pool) {
      try {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await pool.end();
      }
    }
    await socket?.stop();
    await engine?.close();
  }
}, 20000);
it("lists only technician names/IDs with bounded pagination for coordinators", async () => {
  const a = await get(coordinator, "/api/technicians?limit=1&page=1"),
    b = await get(coordinator, "/api/technicians?limit=1&page=2");
  expect(a.status).toBe(200);
  expect(a.body.total).toBe(2);
  expect(a.body.items[0].id).not.toBe(b.body.items[0].id);
  expect(Object.keys(a.body.items[0]).sort()).toEqual(["displayName", "id"]);
  expect((await get(student, "/api/technicians")).status).toBe(403);
  expect((await get(coordinator, "/api/technicians?limit=51")).status).toBe(
    400,
  );
});
it.each(["triage", "assign"])(
  "rejects student/technician %s and exposes no claim API",
  async (command) => {
    const r = await create();
    const body =
      command === "assign"
        ? { action: command, expectedVersion: 0, technicianId: tech.id }
        : { action: command, expectedVersion: 0 };
    for (const who of [student, tech])
      expect((await action(who, r.id, body)).status).toBe(403);
    expect(
      (await action(tech, r.id, { action: "claim", expectedVersion: 0 }))
        .status,
    ).toBe(400);
  },
);
it("requires triage before assignment and a real technician", async () => {
  const r = await create();
  expect(
    (
      await action(coordinator, r.id, {
        action: "assign",
        expectedVersion: 0,
        technicianId: tech.id,
      })
    ).status,
  ).toBe(409);
  await action(coordinator, r.id, { action: "triage", expectedVersion: 0 });
  for (const id of [student.id, randomUUID()])
    expect(
      (
        await action(coordinator, r.id, {
          action: "assign",
          expectedVersion: 1,
          technicianId: id,
        })
      ).status,
    ).toBe(400);
});
it("assigns once and prevents both duplicate and conflicting assignments", async () => {
  const id = await available();
  const r = await action(coordinator, id, {
    action: "assign",
    expectedVersion: 1,
    technicianId: tech.id,
  });
  expect(r.status).toBe(200);
  expect(r.body.request).toMatchObject({
    assigneeId: tech.id,
    status: "in_progress",
    version: 2,
  });
  expect(
    (
      await action(coordinator2, id, {
        action: "assign",
        expectedVersion: 1,
        technicianId: tech2.id,
      })
    ).body.error.code,
  ).toBe("STALE_VERSION");
  expect(
    (
      await action(coordinator2, id, {
        action: "assign",
        expectedVersion: 2,
        technicianId: tech2.id,
      })
    ).body.error.code,
  ).toBe("INVALID_TRANSITION");
  const events = await pool.query(
    "SELECT * FROM request_events WHERE request_id=$1 AND action='assign'",
    [id],
  );
  expect(events.rowCount).toBe(1);
  expect(events.rows[0].assignee_id).toBe(tech.id);
});
it("assigned work and history are inaccessible to another technician or student", async () => {
  const id = await assigned();
  expect((await get(tech, `/api/requests/${id}`)).status).toBe(200);
  expect((await get(tech2, `/api/requests/${id}`)).status).toBe(404);
  expect((await get(other, `/api/requests/${id}/events`)).status).toBe(404);
  expect((await get(tech2, `/api/requests/${id}/events`)).status).toBe(404);
  expect(
    (
      await action(tech2, id, {
        action: "resolve",
        expectedVersion: 2,
        note: "Wrong technician",
      })
    ).status,
  ).toBe(404);
  const list = await get(
    tech,
    "/api/requests?status=in_progress&location=Workflow%20lab&limit=50",
  );
  expect(list.body.items.some((r: { id: string }) => r.id === id)).toBe(true);
  expect(
    list.body.items.every(
      (r: { assigneeId: string }) => r.assigneeId === tech.id,
    ),
  ).toBe(true);
});
it("available technicians cannot read private history", async () => {
  const id = await available();
  expect((await get(tech, `/api/requests/${id}`)).status).toBe(200);
  expect((await get(tech, `/api/requests/${id}/events`)).status).toBe(403);
});
it("records resolve/reopen/resolve/close with stable paginated progress and notes", async () => {
  const id = await resolved();
  let r = await action(student, id, {
    action: "reopen",
    expectedVersion: 3,
    note: "The fault returned.",
  });
  expect(r.body.request).toMatchObject({
    status: "in_progress",
    assigneeId: tech.id,
    resolutionNote: null,
    version: 4,
  });
  expect(
    (
      await action(tech, id, {
        action: "resolve",
        expectedVersion: 2,
        note: "Old duplicate",
      })
    ).status,
  ).toBe(409);
  await action(tech, id, {
    action: "resolve",
    expectedVersion: 4,
    note: "Replaced cable.",
  });
  r = await action(student, id, { action: "close", expectedVersion: 5 });
  expect(r.body.request.status).toBe("closed");
  expect(
    (
      await action(student, id, {
        action: "reopen",
        expectedVersion: 6,
        note: "Too late",
      })
    ).status,
  ).toBe(409);
  const a = await get(student, `/api/requests/${id}/events?limit=2&page=1`),
    b = await get(student, `/api/requests/${id}/events?limit=2&page=2`);
  expect(a.body.total).toBe(7);
  expect(a.body.items.map((e: { action: string }) => e.action)).toEqual([
    "close",
    "resolve",
  ]);
  expect(a.body.items[1].note).toBe("Replaced cable.");
  expect(b.body.items[0].action).toBe("reopen");
  expect(a.body.items[0]).not.toHaveProperty("actorId");
  expect(
    (await get(student, `/api/requests/${id}/events?limit=51`)).status,
  ).toBe(400);
});
it.each(["close", "reopen"])(
  "only reporter can %s; resolution cannot be performed by coordinator",
  async (command) => {
    const id = await resolved();
    const body =
      command === "reopen"
        ? { action: command, expectedVersion: 3, note: "Still broken" }
        : { action: command, expectedVersion: 3 };
    expect((await action(other, id, body)).status).toBe(404);
    expect((await action(coordinator, id, body)).status).toBe(403);
    expect(
      (
        await action(coordinator, id, {
          action: "resolve",
          expectedVersion: 3,
          note: "No",
        })
      ).status,
    ).toBe(403);
  },
);
it("rejects missing/invalid versions, blank/oversized notes and mass assignment", async () => {
  const id = await assigned();
  for (const body of [
    { action: "resolve", note: "Fixed" },
    { action: "resolve", expectedVersion: -1, note: "Fixed" },
    { action: "resolve", expectedVersion: 2, note: " " },
    { action: "resolve", expectedVersion: 2, note: "x".repeat(2001) },
    {
      action: "resolve",
      expectedVersion: 2,
      note: "Fixed",
      assigneeId: tech2.id,
    },
  ])
    expect((await action(tech, id, body)).status).toBe(400);
  expect(
    (
      await action(tech, id, {
        action: "resolve",
        expectedVersion: 2,
        note: "x".repeat(2000),
      })
    ).status,
  ).toBe(200);
});
it("new writes retain authentication, exact Origin and CSRF protections", async () => {
  const r = await create(),
    path = `/api/requests/${r.id}/actions`;
  expect(
    (await request(app).post(path).set("Origin", origin).send({})).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .post(path)
        .set("Cookie", coordinator.cookie)
        .set("Origin", origin)
        .send({})
    ).body.error.code,
  ).toBe("CSRF_REJECTED");
  expect(
    (
      await post(coordinator, path)
        .set("Origin", "http://localhost:3100")
        .send({})
    ).body.error.code,
  ).toBe("ORIGIN_REJECTED");
});
it("event insertion failure rolls assignment and version back", async () => {
  const id = await available();
  await pool.query(
    "ALTER TABLE request_events ADD CONSTRAINT injected_audit_failure CHECK (action <> 'assign') NOT VALID",
  );
  try {
    expect(
      (
        await action(coordinator, id, {
          action: "assign",
          expectedVersion: 1,
          technicianId: tech.id,
        })
      ).status,
    ).toBe(500);
    const r = await get(coordinator, `/api/requests/${id}`);
    expect(r.body.request).toMatchObject({
      version: 1,
      status: "available",
      assigneeId: null,
    });
    expect(
      (
        await pool.query(
          "SELECT id FROM request_events WHERE request_id=$1 AND action='assign'",
          [id],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await pool.query(
      "ALTER TABLE request_events DROP CONSTRAINT injected_audit_failure",
    );
  }
  expect(
    (
      await action(coordinator, id, {
        action: "assign",
        expectedVersion: 1,
        technicianId: tech.id,
      })
    ).status,
  ).toBe(200);
});
it("database rejects non-technician assignees and duplicate audit versions", async () => {
  const id = await available();
  const invalid =
    "UPDATE maintenance_requests SET status='in_progress',assignee_id=$1 WHERE id=$2";
  if (engine)
    await expect(
      engine
        .query(`SET search_path TO "${schema}"`)
        .then(() => engine!.query(invalid, [student.id, id])),
    ).rejects.toThrow();
  else await expect(pool.query(invalid, [student.id, id])).rejects.toThrow();
  const duplicate =
    "INSERT INTO request_events(request_id,actor_id,action,next_status,request_version) VALUES($1,$2,'create','reported',0)";
  if (engine)
    await expect(engine.query(duplicate, [id, student.id])).rejects.toThrow();
  else await expect(pool.query(duplicate, [id, student.id])).rejects.toThrow();
});
// Native-only: PGlite's adapter is single-connection and cannot validate contention.
it.skipIf(!native).each(["assign", "triage"])(
  "native two-coordinator race: %s has exactly one winner",
  async (command) => {
    for (let run = 0; run < 3; run++) {
      const id = command === "assign" ? await available() : (await create()).id;
      const version = command === "assign" ? 1 : 0;
      const blocker = await pool.connect();
      await blocker.query("BEGIN");
      await blocker.query(
        "SELECT id FROM maintenance_requests WHERE id=$1 FOR UPDATE",
        [id],
      );
      let waiting = 0;
      const bodies = [tech.id, tech2.id].map((technicianId) =>
        command === "assign"
          ? { action: command, expectedVersion: version, technicianId }
          : { action: command, expectedVersion: version },
      );
      const pending = [
        action(coordinator, id, bodies[0]!).then((r) => r),
        action(coordinator2, id, bodies[1]!).then((r) => r),
      ];
      try {
        for (let attempt = 0; attempt < 100; attempt++) {
          await blocker.query("SELECT pg_stat_clear_snapshot()");
          const r = await blocker.query(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND pid<>pg_backend_pid() AND wait_event_type='Lock'",
            [schema],
          );
          waiting = r.rows[0].n;
          if (waiting >= 2) break;
          await new Promise((ok) => setTimeout(ok, 20));
        }
      } finally {
        await blocker.query("COMMIT");
        blocker.release();
      }
      const responses = await Promise.all(pending);
      expect(waiting).toBeGreaterThanOrEqual(2);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      const success = responses.find((r) => r.status === 200)!;
      const rows = await pool.query(
        "SELECT * FROM request_events WHERE request_id=$1 AND action=$2",
        [id, command],
      );
      expect(rows.rowCount).toBe(1);
      expect(success.body.request.version).toBe(version + 1);
      if (command === "assign")
        expect(rows.rows[0].assignee_id).toBe(success.body.request.assigneeId);
      const persisted = await pool.query(
        "SELECT version,assignee_id FROM maintenance_requests WHERE id=$1",
        [id],
      );
      expect(persisted.rows[0].version).toBe(version + 1);
      expect(persisted.rows[0].assignee_id).toBe(
        success.body.request.assigneeId,
      );
      raceEvidence.push({
        command,
        run,
        waitingActors: waiting,
        statuses: responses.map((r) => r.status),
        eventCount: rows.rowCount,
        version: success.body.request.version,
        postgres: (await pool.query("SHOW server_version")).rows[0]
          .server_version,
      });
    }
  },
  30000,
);

it("M3 migration preserves existing requests/history and safely reruns", async () => {
  const r = await pool.query(
    "SELECT r.version,e.request_version FROM maintenance_requests r JOIN request_events e ON e.request_id=r.id WHERE r.title='Preserved M3 report'",
  );
  expect(r.rowCount).toBe(1);
  expect(r.rows[0]).toEqual({ version: 0, request_version: null });
  expect(
    (
      await pool.query("SELECT name FROM campusfix_migrations ORDER BY name")
    ).rows.map((r) => r.name),
  ).toEqual(["001_initial.sql", "002_workflow.sql", "003_outbox.sql"]);
});

it("versioned history rejects a missing previous status", async () => {
  const id = (await create()).id;
  const sql =
    "INSERT INTO request_events(request_id,actor_id,action,next_status,request_version) VALUES($1,$2,'triage','available',1)";
  if (engine) {
    await engine.query(`SET search_path TO "${schema}"`);
    await expect(engine.query(sql, [id, coordinator.id])).rejects.toThrow();
  } else await expect(pool.query(sql, [id, coordinator.id])).rejects.toThrow();
});

it("incompatible legacy assignment fails migration atomically without deleting the record", () => {
  expect(rejectedUpgradePreserved).toBe(true);
});

async function liveSocket(
  who?: Identity,
  options: { origin?: string; csrf?: string } = {},
) {
  const connection = connectSocket(liveURL, {
    transports: ["websocket"],
    autoConnect: false,
    reconnection: false,
    auth: { csrfToken: options.csrf ?? who?.csrf },
    extraHeaders: {
      Origin: options.origin ?? origin,
      ...(who ? { Cookie: who.cookie } : {}),
    },
    timeout: 2000,
  });
  clients.push(connection);
  await new Promise<void>((ok, no) => {
    connection.once("connect", ok).once("connect_error", no);
    connection.connect();
  });
  return connection;
}
function nextChange(connection: Socket) {
  return new Promise<{ requestId: string; version: number; action: string }>(
    (ok, no) => {
      const timeout = setTimeout(
        () => no(new Error("No authorized live event")),
        2000,
      );
      connection.once("request:changed", (event) => {
        clearTimeout(timeout);
        ok(event);
      });
    },
  );
}
it("Socket.IO authenticates cookie/CSRF and rejects unauthenticated and cross-origin connections", async () => {
  const s = await liveSocket(student);
  expect(s.connected).toBe(true);
  s.disconnect();
  await expect(liveSocket()).rejects.toThrow("AUTHENTICATION_REQUIRED");
  await expect(liveSocket(student, { csrf: "bad" })).rejects.toThrow(
    "CSRF_REJECTED",
  );
  await expect(
    liveSocket(student, { origin: "https://invalid.example" }),
  ).rejects.toThrow();
});
it("Socket.IO rejects arbitrary room subscriptions", async () => {
  const s = await liveSocket(student);
  const ack = await new Promise<{ error: string }>((ok) =>
    s.emit("subscribe", "coordinator", ok),
  );
  expect(ack.error).toBe("FORBIDDEN");
  s.disconnect();
});
it("Socket.IO emits compact committed creation to coordinator but not unrelated users", async () => {
  const allowed = await liveSocket(coordinator),
    outsider = await liveSocket(other),
    worker = await liveSocket(tech2);
  const denied: unknown[] = [];
  outsider.on("request:changed", (e) => denied.push(e));
  worker.on("request:changed", (e) => denied.push(e));
  const event = nextChange(allowed),
    row = await create(),
    received = await event;
  expect(received).toEqual({ requestId: row.id, version: 0, action: "create" });
  const committed = await pool.query(
    "SELECT version FROM maintenance_requests WHERE id=$1",
    [row.id],
  );
  expect(committed.rows[0].version).toBe(0);
  await new Promise((ok) => setTimeout(ok, 100));
  expect(denied).toEqual([]);
  allowed.disconnect();
  outsider.disconnect();
  worker.disconnect();
});
it("Socket.IO notifies assigned technician and reporter after assignment", async () => {
  const id = await available(),
    reporter = await liveSocket(student),
    worker = await liveSocket(tech);
  const events = [nextChange(reporter), nextChange(worker)];
  expect(
    (
      await action(coordinator, id, {
        action: "assign",
        expectedVersion: 1,
        technicianId: tech.id,
      })
    ).status,
  ).toBe(200);
  for (const event of await Promise.all(events))
    expect(event).toEqual({ requestId: id, version: 2, action: "assign" });
  reporter.disconnect();
  worker.disconnect();
});
it("Socket.IO emits no successful update on audit rollback", async () => {
  const id = await available(),
    s = await liveSocket(student),
    events: unknown[] = [];
  s.on("request:changed", (e) => events.push(e));
  await pool.query(
    "ALTER TABLE request_events ADD CONSTRAINT injected_live_failure CHECK (action <> 'assign') NOT VALID",
  );
  try {
    expect(
      (
        await action(coordinator, id, {
          action: "assign",
          expectedVersion: 1,
          technicianId: tech.id,
        })
      ).status,
    ).toBe(500);
    await new Promise((ok) => setTimeout(ok, 100));
    expect(events).toEqual([]);
  } finally {
    await pool.query(
      "ALTER TABLE request_events DROP CONSTRAINT injected_live_failure",
    );
    s.disconnect();
  }
});
it("Socket.IO rechecks a revoked session before delivering private events", async () => {
  const fresh = await login("student2@campusfix.test"),
    s = await liveSocket(fresh),
    events: unknown[] = [];
  s.on("request:changed", (e) => events.push(e));
  const expired = new Promise<void>((ok) => s.once("session:expired", ok));
  await post(fresh, "/api/auth/logout").send({});
  await create();
  await expired;
  expect(events).toEqual([]);
  expect(s.connected).toBe(false);
});
it("Socket.IO reconnection has one server connection and one update", async () => {
  const s = await liveSocket(coordinator);
  s.disconnect();
  await new Promise<void>((ok, no) => {
    s.once("connect", ok).once("connect_error", no);
    s.connect();
  });
  let count = 0;
  s.on("request:changed", () => count++);
  const update = nextChange(s);
  await create();
  await update;
  expect(count).toBe(1);
  expect(
    [...live.io.sockets.sockets.values()].filter(
      (x) => x.data.actor.id === coordinator.id,
    ),
  ).toHaveLength(1);
  s.disconnect();
});
it("Socket.IO publish failure cannot undo an already committed REST change", async () => {
  const failedApp = createApp(async () => {}, {
    db: drizzle(pool),
    config: readConfig({
      DATABASE_URL: url,
      NODE_ENV: "test",
      APP_ORIGIN: origin,
    }),
    publish: async () => {
      throw new Error("Injected transport failure");
    },
  });
  const r = await request(failedApp)
    .post("/api/requests")
    .set("Cookie", student.cookie)
    .set("Origin", origin)
    .set("X-CSRF-Token", student.csrf)
    .send({
      title: "Committed transport failure",
      description: "This report survives a failed notification.",
      location: "Live lab",
    });
  expect(r.status).toBe(201);
  expect(
    (
      await pool.query("SELECT id FROM maintenance_requests WHERE id=$1", [
        r.body.request.id,
      ])
    ).rowCount,
  ).toBe(1);
});
