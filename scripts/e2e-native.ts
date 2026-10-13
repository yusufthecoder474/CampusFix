import { spawnSync } from "node:child_process";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("TEST_DATABASE_URL must point to a separate *_test database");
for (const config of [
  "playwright.config.ts",
  "playwright.realtime.config.ts",
]) {
  const child = spawnSync(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", "--config", config],
    { stdio: "inherit", env: { ...process.env, CAMPUSFIX_E2E_NATIVE: "1" } },
  );
  if (child.status !== 0) {
    process.exitCode = child.status ?? 1;
    break;
  }
}
