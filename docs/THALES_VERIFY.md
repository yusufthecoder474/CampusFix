# Reproducible disposable verification

## Prerequisites

Use Node.js 24, npm, Docker Engine with Compose v2, and free browser-test ports
4310, 4311 and 4313. The runner checks Node, npm, Docker server and Compose before
starting anything. Dependency installation and image/browser downloads require
network access. Linux Chromium needs system libraries; install them with the
Playwright command below. Do not run this from your existing application Compose
project to clean up its resources.

## Linux or WSL2

From the project root:

```bash
node scripts/verify-disposable.mjs --prerequisites
npm ci
npx playwright install --with-deps chromium
npm run verify:disposable -- --skip-install --skip-browser-install
```

On WSL2, enable Docker Desktop's WSL integration for the distribution and keep the
checkout in its Linux filesystem. The same commands then apply. Run Docker
Desktop before checking prerequisites.

## Windows PowerShell

With Node 24 and Docker Desktop running Linux containers:

```powershell
node scripts/verify-disposable.mjs --prerequisites
npm ci
npx playwright install chromium
npm run verify:disposable -- --skip-install --skip-browser-install
```

These are documented Windows commands, not a claim of a native Windows test run.
Alternatively, `npm run verify:disposable` installs locked npm dependencies and
Chromium itself. Linux system dependencies must already be available for that
short form. Existing development setup remains in [WINDOWS.md](WINDOWS.md).

## What the runner owns

`scripts/verify-disposable.mjs` generates a unique Compose project, a random test
password and a PostgreSQL 18 container from `compose.test.yaml`. PostgreSQL binds
only to loopback at an ephemeral port and stores its cluster in temporary memory.
Compose waits for `pg_isready`; the runner then obtains the actual mapped port.
It does not load `.env`, use an existing DATABASE_URL, mount a development volume,
or stop another application's server. Do not manually run the test Compose file
with development credentials.

The runner performs type checks, lint, formatting, default backend tests, React
tests, native PostgreSQL integration tests, a build, and both browser suites
against native PostgreSQL. Default tests deliberately use PGlite; only the native
phase establishes lock contention. Each native fixture creates a random private
schema, runs existing migrations 001 and 002, seeds synthetic users and removes
that schema afterwards. No new migration is needed for the isolation change.
The container's disposable database name ends in `_test`; native scripts reject
other names. This name check supplements isolation rather than proving that an
arbitrary externally supplied URL is safe.

Logs, exact child commands, exit codes, environment, JSON results, race evidence
and screenshots go to `docs/evidence/thales-local/<run-id>/`. Failed checks stop
later checks and collect this container's database logs. A `finally` block removes
only the generated Compose project, including partial startup failures. Ordinary
SIGINT/SIGTERM requests trigger cleanup. SIGKILL or a host crash can prevent it;
the recorded project name identifies the task-owned resource for later cleanup.
No broad Docker prune, volume deletion or application-table truncation is used.

## CI and evidence

`.github/workflows/ci.yml` runs the same disposable harness on Ubuntu with Node
24 and Chromium, then checks production dependency advisories. It uploads logs
and test artifacts even on failure. CI is evidence only when its actual run has
completed successfully; a workflow file by itself is not a successful run.
See [THALES_REPORT.md](THALES_REPORT.md) for exact run identities and limitations.
Coverage is not measured by this workflow. Existing milestone JSON reports are
historical and must not be substituted for current results.
