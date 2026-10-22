import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flags = new Set(process.argv.slice(2));
const supported = ["--prerequisites", "--skip-install", "--skip-browser-install"];
if ([...flags].some((flag) => !supported.includes(flag))) throw new Error("Unknown verification flag");
const runId = Date.now().toString(36) + "-" + randomBytes(4).toString("hex");
const project = "campusfix-check-" + runId;
const evidence = resolve(root, "docs/evidence/thales-local", runId);
mkdirSync(evidence, { recursive: true });
const steps = [];
const npmFile = process.env.npm_execpath;
const environment = {
  ...process.env,
  CAMPUSFIX_NATIVE_TEST: "0",
  CAMPUSFIX_E2E_NATIVE: "0",
  CAMPUSFIX_TEST_PASSWORD: randomBytes(24).toString("hex"),
  CAMPUSFIX_EVIDENCE_DIR: evidence,
  CAMPUSFIX_SCREENSHOT_DIR: resolve(evidence, "screenshots"),
};
const compose = ["compose", "-p", project, "-f", resolve(root, "compose.test.yaml")];
let created = false;
let interrupted = false;
let activeChild;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  interrupted = true;
  process.exitCode = 1;
  activeChild?.kill("SIGTERM");
});

function logStep(name, command, args, allowFailure = false) {
  if (interrupted && !allowFailure) throw new Error("Verification interrupted");
  console.log(name);
  const started = performance.now();
  const logPath = resolve(evidence, name.replaceAll(/[^a-z0-9-]/gi, "-") + ".log");
  return new Promise((ok, no) => {
    let output = "", settled = false;
    const child = spawn(command, args, {
      cwd: root, env: environment,
      shell: process.platform === "win32" && command.endsWith(".cmd"),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const capture = (chunk) => {
      const value = chunk.toString();
      output += value;
      appendFileSync(logPath, value);
    };
    activeChild = child;
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    const finish = (code) => {
      if (settled) return;
      settled = true;
      activeChild = undefined;
      steps.push({ name, command: [command, ...args], exitCode: code, durationMs: performance.now() - started });
      if (output) console.log(output.slice(-12000));
      if (code !== 0 && !allowFailure) no(new Error(`${name} failed; see its diagnostic log`));
      else ok(output);
    };
    child.once("error", () => finish(-1));
    child.once("close", (code) => finish(code ?? -1));
  });
}
function npm(name, args) {
  return npmFile
    ? logStep(name, process.execPath, [npmFile, ...args])
    : logStep(name, process.platform === "win32" ? "npm.cmd" : "npm", args);
}
function save(status) {
  writeFileSync(resolve(evidence, "run.json"), JSON.stringify({
    status, runId, project, platform: process.platform, node: process.version,
    sourceRevision: process.env.GITHUB_SHA ?? null,
    commands: steps,
    database: "A new ephemeral PostgreSQL 18 container; application .env is not loaded",
    coverage: "Not measured",
  }, null, 2) + "\n");
}
try {
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Node 24 is required");
  await npm("npm-version", ["--version"]);
  await logStep("docker-version", "docker", ["version", "--format", "{{.Server.Version}}"]);
  await logStep("compose-version", "docker", ["compose", "version"]);
  if (flags.has("--prerequisites")) save("prerequisites-passed");
  else {
    if (!flags.has("--skip-install")) await npm("install", ["ci"]);
    if (!existsSync(resolve(root, "node_modules/vitest/vitest.mjs"))) throw new Error("Locked dependencies are missing");
    // Mark ownership before startup so partial Compose failures are cleaned too.
    created = true;
    await logStep("database-start", "docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "90"]);
    const endpoint = (await logStep("database-port", "docker", [...compose, "port", "db", "5432"])).trim();
    if (!/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Unexpected database port mapping");
    environment.TEST_DATABASE_URL = `postgresql://campusfix_test:${environment.CAMPUSFIX_TEST_PASSWORD}@${endpoint}/campusfix_verify_test`;
    await npm("typecheck", ["run", "check"]);
    await npm("lint", ["run", "lint"]);
    await npm("format-check", ["run", "format:check"]);
    await npm("backend", ["test", "--", "--reporter=default", "--reporter=json", `--outputFile=${resolve(evidence, "backend.json")}`]);
    await npm("frontend", ["run", "test:frontend", "--", "--reporter=default", "--reporter=json", `--outputFile=${resolve(evidence, "frontend.json")}`]);
    await logStep("native-postgresql", process.execPath, ["--import", "tsx", "scripts/test-native.ts"]);
    await npm("build", ["run", "build"]);
    if (!flags.has("--skip-browser-install")) await npm("browser-install", ["exec", "--", "playwright", "install", "chromium"]);
    await logStep("native-browser", process.execPath, ["--import", "tsx", "scripts/e2e-native.ts"]);
    save("passed");
  }
} catch (error) {
  save("failed");
  console.error(error instanceof Error ? error.message : "Verification failed");
  if (created) await logStep("database-diagnostics", "docker", [...compose, "logs", "--no-color", "--tail", "100"], true);
  process.exitCode = 1;
} finally {
  if (created) {
    const removed = await logStep("owned-database-cleanup", "docker", [...compose, "down", "--remove-orphans"], true);
    void removed;
    if (steps.at(-1)?.exitCode !== 0) process.exitCode = 1;
    // Rewrite the manifest to include the cleanup command; failure remains visible.
    const current = process.exitCode === 1 ? "failed" : "passed";
    save(current);
  }
  console.log("Diagnostic folder: " + evidence);
}
