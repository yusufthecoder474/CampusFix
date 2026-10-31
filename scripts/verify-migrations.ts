import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { migrate } from "./migrate.js";

// Destructive DDL is limited to a fresh, uniquely named schema in a local *_test DB.
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required");
const parsed = new URL(url);
const databaseName = parsed.pathname.slice(1);
if (
  !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
  !/^[a-z][a-z0-9_]*_test$/.test(databaseName)
)
  throw new Error("Migration verification requires a local *_test database");

const schema = "campusfix_rollback_" + randomUUID().replaceAll("-", "");
const client = new pg.Client({ connectionString: url });
let schemaCreated = false;
try {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;

  // Apply M1, and write a row that must survive a later migration failure.
  await migrate(url, schema, "001_initial.sql");
  const userId = randomUUID();
  await client.query(
    `INSERT INTO "${schema}".users(id,email,display_name,role,password_hash) VALUES($1,$2,'Synthetic migration fixture','student','unusable-test-hash')`,
    [userId, "migration-fixture@campusfix.test"],
  );
  await client.query(
    `ALTER TABLE "${schema}".maintenance_requests ADD COLUMN version integer NOT NULL DEFAULT 0`,
  );

  // M2 attempts to add version again. It must fail and roll back as a unit.
  await assert.rejects(
    migrate(url, schema),
    /column .*version.* already exists|already exists/i,
  );
  const unfinished = await client.query(
    `SELECT name FROM "${schema}".campusfix_migrations ORDER BY name`,
  );
  assert.deepEqual(
    unfinished.rows.map((row: { name: string }) => row.name),
    ["001_initial.sql"],
  );
  const unfinishedColumn = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='maintenance_requests' AND column_name='assignee_role'",
    [schema],
  );
  assert.equal(unfinishedColumn.rowCount, 0, "Failed M2 left schema changes");
  const existingUser = await client.query(
    `SELECT id FROM "${schema}".users WHERE id=$1`,
    [userId],
  );
  assert.equal(existingUser.rowCount, 1, "Failed M2 lost pre-existing rows");

  // Correct the deliberately injected conflict, then finish M2 twice.
  await client.query(
    `ALTER TABLE "${schema}".maintenance_requests DROP COLUMN version`,
  );
  await migrate(url, schema);
  await migrate(url, schema);
  const applied = await client.query(
    `SELECT name,checksum FROM "${schema}".campusfix_migrations ORDER BY name`,
  );
  assert.deepEqual(
    applied.rows.map((row: { name: string }) => row.name),
    ["001_initial.sql", "002_workflow.sql"],
  );
  assert.equal(
    (
      await client.query(`SELECT id FROM "${schema}".users WHERE id=$1`, [
        userId,
      ])
    ).rowCount,
    1,
  );

  // A modified migration checksum must be rejected rather than replayed.
  const originalChecksum = applied.rows[1].checksum as string;
  await client.query(
    `UPDATE "${schema}".campusfix_migrations SET checksum='tampered' WHERE name='002_workflow.sql'`,
  );
  await assert.rejects(migrate(url, schema), /Migration checksum mismatch/);
  await client.query(
    `UPDATE "${schema}".campusfix_migrations SET checksum=$1 WHERE name='002_workflow.sql'`,
    [originalChecksum],
  );
  await migrate(url, schema);
  console.log(
    "PASS: migration rollback, legacy data preservation, retry and checksum safety",
  );
} finally {
  if (schemaCreated) {
    await client.query(`DROP SCHEMA "${schema}" CASCADE`).catch(() => {});
  }
  await client.end().catch(() => {});
}
