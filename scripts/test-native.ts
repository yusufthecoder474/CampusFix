import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "TEST_DATABASE_URL must reference a separate database ending in _test",
  );
mkdirSync("docs/evidence", { recursive: true });
// A private random schema is created and removed by the tests; no application tables are truncated.
const child = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/integration.test.ts",
    "tests/workflow-api.test.ts",
    "--reporter=default",
    "--reporter=json",
    "--outputFile=docs/evidence/m5-native-results.json",
  ],
  { stdio: "inherit", env: { ...process.env, CAMPUSFIX_NATIVE_TEST: "1" } },
);
process.exitCode = child.status ?? 1;
