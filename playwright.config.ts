import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.E2E_PORT ?? 4310);
const workflowPort = Number(process.env.WORKFLOW_E2E_PORT ?? 4311);
export default defineConfig({
  testDir: "e2e",
  testIgnore: "**/realtime.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "docs/evidence/m5-browser-results.json" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    launchOptions: process.env.CAMPUSFIX_BROWSER_EXECUTABLE
      ? {
          executablePath: process.env.CAMPUSFIX_BROWSER_EXECUTABLE,
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-zygote",
          ],
        }
      : undefined,
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "regression",
      testMatch: "**/workflows.spec.ts",
      use: { baseURL: `http://127.0.0.1:${port}` },
    },
    {
      name: "workflow",
      testMatch: "**/workflow-lifecycle.spec.ts",
      use: { baseURL: `http://127.0.0.1:${workflowPort}` },
    },
  ],
  webServer: [port, workflowPort].map((p) => ({
    command: "node --import tsx scripts/e2e-server.ts",
    env: { E2E_PORT: String(p) },
    url: `http://127.0.0.1:${p}/health/ready`,
    reuseExistingServer: false,
    timeout: 60000,
  })),
});
