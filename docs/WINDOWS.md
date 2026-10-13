# Windows 11 — final milestone upgrade

Your supplied M4 baseline: Node 24.21.0, PostgreSQL 18, TypeScript/lint/build/doctor passed, 76 backend tests plus two native-only skipped in embedded mode, 21 React tests, 51 native integration tests, and ten browser cases in both embedded and native modes. Those are your M4 results; rerun the final version before claiming final native verification.

## Preserve the existing database

The original Compose project is **campusfix**, under your M2 directory. PostgreSQL host port is **5433**; app address is **http://127.0.0.1:3100**. Leave that database container and volume intact. Stop only the Node app with Ctrl+C before upgrading.

Extract the final archive into your existing app folder, or a new app folder with a private copy of the working M4 .env. Do not overwrite another .env or use .env.example as replacement credentials. Do not run setup to regenerate passwords. Keep DB_PORT=5433, both database URL ports at 5433 and credentials unchanged. Migration 001/002 checksums are unchanged; no 003 or new application database is required.

If the database is stopped, run the following from the ORIGINAL M2 Compose directory, using its working .env:

```powershell
docker compose --project-name campusfix up -d --wait
```

Run application commands from the FINAL app directory. Do not start a second Compose project from a differently named extracted folder. A new project name can create an empty volume; it does not mean the old data is gone. Never delete the original volume or use down -v to fix a credential/port issue.

## Install and launch

Use Node 24 (your 24.21.0 is within the supported engine range):

```powershell
node -v
npm ci
npm run check
npm run lint
npm test
npm run test:frontend
npm run build
npm run doctor
npm start
```

Open http://127.0.0.1:3100 exactly. localhost is a different Origin. Existing seeded accounts/passwords remain. No seed rerun is necessary. npm run migrate is an optional safe checksum/rerun check, not a requirement to change data when 002 is already applied.

`npm run dev` builds React before starting TypeScript. Optional `npm run watch:web` in a second terminal rebuilds assets; refresh after rebuild. The frontend and Socket.IO use the API origin; no extra frontend port or credential setting is required.

## Final test gates

```powershell
npm run test:realtime
npx playwright install chromium
npm run test:e2e
npm run test:e2e:realtime
npm run db:test:prepare
npm run test:integration
npm run test:e2e:native
npm run measure:bundle
npm audit
```

Native tests use the separate campusfix_test database at host port 5433 and the existing credentials. They create/remove only their own random schemas. Native integration includes the preserved concurrency/transaction cases plus actual Socket.IO checks. Native E2E now runs both browser configs sequentially, including realtime/responsive/accessibility tests. Keep the final reports in docs/evidence and report their actual counts; do not count skipped/filter-excluded tests as passed.

Browser suites use isolated servers to preserve the application rate limit: ports 4310 (regression), 4311 (workflow) and 4313 (realtime). If occupied, choose free values deliberately:

```powershell
$env:E2E_PORT = "4320"
$env:WORKFLOW_E2E_PORT = "4321"
$env:REALTIME_E2E_PORT = "4323"
npm run test:e2e:native
Remove-Item Env:E2E_PORT, Env:WORKFLOW_E2E_PORT, Env:REALTIME_E2E_PORT
```

The scripts never kill/reuse unrelated servers. Normal runs use Playwright's installed Chromium. CAMPUSFIX_BROWSER_EXECUTABLE is a trusted-local-binary fallback only; record its exact version. If Vitest workers exhaust memory:

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism
npm run test:frontend:serial
```

## Demo and troubleshooting

Use independent browser contexts for student/coordinator/technician; ordinary tabs share an account cookie. Check Connection: Live. Perform creation, triage, assignment, resolution, reopening and closure without manual refresh. Notifications are local to the session; reconnect refetches state, not notification history.

A 409 means another action/version won: review refreshed progress. Missing Origin/CSRF causes 403; expired session causes sign-in. WebSocket authorization uses the same cookie, exact Origin and CSRF token. A blocked transport leaves REST/manual refresh usable. Production rate limits remain unchanged; wait when 429 occurs rather than restarting to evade the limit.

Keep main PostgreSQL port 5433. If it becomes occupied, inspect netstat and the existing container first; do not change credentials or start a new volume. An intentional port change must update DB_PORT and both URLs and apply Compose under the original project identity. Application port changes must update PORT and APP_ORIGIN together.

No native Windows commands or Docker operations were executed by the build environment for this final milestone. Your existing records were not accessible here; code/immutable-migration checks and isolated fixture persistence tests establish the preservation design. Confirm your own existing reports after upgrade.

## Earlier M4 migration reference

The following describes the already-applied M4 upgrade only, not new changes in the final milestone.

# Windows 11 — safe M3 to M4 upgrade

Your reported M3 baseline passed npm install/check/lint/build, 59 backend tests, 32 native PostgreSQL integration tests, 13 React tests and 6 Chromium scenarios in both embedded and native modes. PostgreSQL 18 is healthy on host port **5433**. Preserve it. M4 commands below have not been executed on Windows by the build environment.

## Existing folder: preferred upgrade

1. Stop only the CampusFix Node server with Ctrl+C. Keep Docker PostgreSQL running. Back up source and database before applying schema changes. Keep your private `.env` unchanged.
2. Extract the archive's `CampusFix` contents into the existing project directory, without nesting another CampusFix folder. The archive excludes `.env`, node_modules and build outputs.
3. Use Node 24. Do not run `npm run setup`, replace `.env` with `.env.example`, change credentials, delete volumes or reset data.

```powershell
npm ci
npm run check
npm run lint
npm test
npm run test:frontend
npm run migrate
npm run doctor
npm run build
npm start
```

Migration 002 adds workflow fields/constraints. Migration 001 and its checksum remain unchanged. Existing requests/history/passwords are preserved; old events keep null version because historical versions are unknown. Run migrate again safely if needed. An incompatible existing assignment (for example, a student assigned as technician) makes the whole migration fail. Stop and inspect the data; do not delete the record or edit checksums to force success. Migration errors also occur if locks cannot be acquired within five seconds; stop the app and retry during a quiet period. Doctor now checks the M4 schema fields.

No seed rerun is needed. Existing synthetic accounts retain their passwords. Open the exact APP_ORIGIN, normally http://127.0.0.1:3100. localhost is a different Origin.

## If you extract into a different folder

Application folders do not own the data: the existing Docker named volume does. Starting Compose under a new project name can silently create a second empty volume. **Do not start a new Compose project from the extracted folder.**

- Leave the existing database container running. Copy your existing `.env` privately into the new app folder only if no `.env` is already there. Do not post its contents or overwrite another configuration.
- The new app connects to the SAME database using the unchanged DATABASE_URL at host port 5433. Run npm/migrate/start from the new application folder.
- If the database needs starting, use a separate terminal in the ORIGINAL database/Compose directory and run `docker compose up -d --wait` there. Run app commands in the new directory.
- If the original path is unavailable, identify the actual existing project using `docker compose ls` and the existing volume with `docker volume ls`. Preserve that exact project name with Compose's `--project-name` option and the same service/volume definitions. Do not guess a new project name. Keep the original `.env` credentials. Merely seeing a new empty database is not permission to remove the old volume.

For an optional local backup, from the original Compose directory use a custom-format database dump inside the existing db container, then copy it to a protected host file. Avoid PowerShell binary redirection:

```powershell
docker compose exec db pg_dump -U campusfix -d campusfix -Fc -f /tmp/campusfix-before-m4.dump
docker compose cp db:/tmp/campusfix-before-m4.dump ./campusfix-before-m4.dump
```

Use your actual existing database/user names if different. Keep the dump private. This backup procedure is documented, not executed here. No automatic restore or destructive downgrade is provided.

## Ports and credentials

Keep DB_PORT=5433 and port 5433 in DATABASE_URL and TEST_DATABASE_URL; keep all existing passwords. Container-internal PostgreSQL stays on 5432. The fresh-install default 55432 in setup/Compose is not an instruction to change your working M3 setup.

If a port is occupied, inspect it with `netstat -ano | findstr :5433`. Choose a free host port deliberately, update only DB_PORT and both URL ports, then apply Compose from the existing project directory/identity. Preserve credentials and volumes. Do not kill unrelated processes. Changing DB_PASSWORD does not change the password stored in an initialized volume. Never use `docker compose down -v` to resolve a credential problem.

For application port conflict, change PORT and APP_ORIGIN together, then restart. Do not loosen the exact Origin check.

## Tests against your PostgreSQL 18

```powershell
npm run db:test:prepare
npm run test:integration
npx playwright install chromium
npm run build
npm run test:e2e
npm run test:e2e:native
```

TEST_DATABASE_URL must use a separate database ending in `_test`; retain its existing credentials/port. Preparation creates that database only if missing. Tests create and remove their own random schemas, never application tables. Native workflow tests use a pool of five connections and a lock barrier; the test user needs CREATE SCHEMA and visibility into its own pg_stat_activity rows. The same database role owns all test connections. An unobserved contention barrier fails the test rather than reporting a sequential run as concurrency evidence.

Native output writes `docs/evidence/m4-native-results.json` and `m4-native-concurrency.json`. Browser tests overwrite `m4-browser-results.json`; retain separate copies if comparing embedded and native runs. Native browser tests use the real Express routes and isolated synthetic data. Expected native suite includes the original 32 and the new workflow tests; see VERIFICATION.md for build-side counts.

E2E port defaults to 4310. If occupied:

```powershell
$env:E2E_PORT = "4311"
npm run test:e2e:native
Remove-Item Env:E2E_PORT
```

Playwright does not reuse or stop unrelated servers. Browser installation requires CDN access. Prefer the installed Playwright Chromium; CAMPUSFIX_BROWSER_EXECUTABLE is an optional trusted-local-binary fallback and its actual version must be recorded.

## Demo

Student creates report. Coordinator opens it, clicks Triage request, selects Sam Demo and assigns. Sam logs in, filters in_progress work, adds a resolution note and marks resolved. Original student refreshes progress, reopens with a reason or confirms closure. All three can view permitted progress history. A second technician cannot read or resolve Sam's assigned report. Two open coordinator tabs demonstrate a stale-version conflict without overwriting the assignment.

No self-claim/reassignment controls exist. A timed-out write may already have committed: refresh progress before retrying. Sessions/CSRF/Origin protections are unchanged. A 409 refreshes the current detail; 401 requires sign-in, 403 CSRF requires reload, 429 requires waiting.
