import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";
const port = Number(process.env.REALTIME_E2E_PORT ?? 4313);
export default defineConfig({
  ...base,
  testIgnore: [],
  projects: [{ name: "realtime" }],
  testMatch: "**/realtime.spec.ts",
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: `${process.env.CAMPUSFIX_EVIDENCE_DIR ?? "docs/evidence"}/m5-realtime-browser-results.json`,
      },
    ],
  ],
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: "node --import tsx scripts/e2e-server.ts",
    env: { E2E_PORT: String(port) },
    url: `http://127.0.0.1:${port}/health/ready`,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
