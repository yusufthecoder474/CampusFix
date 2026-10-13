# Final milestone verification — 2026-10-12

## Executed in this build environment

Linux, Node 24.19.0, npm 11.9.0; exact dependency pins/lockfile included. Results below come from executed commands and raw reports, not your Windows baseline.

| Check                               | Actual result                                        | Evidence                                                  |
| ----------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| npm ci                              | Passed                                               | m5-install.log                                            |
| npm run check                       | Passed                                               | m5-typecheck.log                                          |
| npm run lint                        | Passed                                               | m5-lint.log                                               |
| Backend Vitest                      | 84 passed, 2 native-only skipped, 0 failed           | m5-backend-results.json; m5-backend.log                   |
| React Vitest                        | 29/29 passed                                         | m5-frontend-results.json; m5-frontend.log                 |
| Dedicated actual socket suite       | 8 passed; 19 unrelated cases excluded by name filter | m5-socket-results.json; m5-socket.log                     |
| Production build                    | Passed                                               | m5-build.log                                              |
| Original/workflow browser suite     | 10/10 passed                                         | m5-browser-results.json; m5-browser.log                   |
| Live/responsive/cache browser suite | 6/6 passed                                           | m5-realtime-browser-results.json; m5-realtime-browser.log |
| Axe accessibility scans             | 10 scans, zero violations/incomplete findings        | m5-accessibility.json                                     |
| Bundle/cache measurements           | Executed; see PERFORMANCE.md                         | m5-bundle-*.json; m5-cache-navigation.json                |
| Dependency audit                    | Zero reported known vulnerabilities                  | m5-dependency-audit.json                                  |

The 84 backend passes INCLUDE the eight Socket.IO cases; do not double-count them. The 29 React cases retain 21 original cases. Six new browser cases are one four-context live/reconnect journey, four responsive/axe cases and one cache-navigation measurement. They are distinct from the original ten, which remain preserved with confirmation interactions and stale-transport isolation appropriate to the new UI.

Actual sockets authenticate cookies/Origin/CSRF, reject room escalation, filter private audiences, notify only after commit, suppress updates on rollback, recheck revoked sessions, avoid duplicate connections on reconnect and preserve a committed REST result when transport publication fails. React mocked-socket tests separately validate listener cleanup; they are not the proof of transport functionality.

Database mode here: PGlite 0.5.8 via socket adapter and actual pg/Drizzle/Express. Constraint tests use the direct embedded API where the adapter loses errors. This is NOT native PostgreSQL or multi-connection contention verification. WebSocket/browser integrations themselves were real, with this embedded database behind the REST service.

Browser: Chromium 153.0.8010.0 external fallback. Standard Playwright Chromium download failed with an invalid archive; m5-browser-install.log records it. The fallback is outside the project and not bundled. Synthetic screenshots at four widths were captured; no personal/credential screenshot is included.

## Native final gates — incomplete here

No postgres/initdb/Docker executables and no configured TEST_DATABASE_URL were available; see m5-environment.json. Native final integration/concurrency and native final browser execution were NOT performed. There is no fabricated native result file.

On your Windows PostgreSQL 18: npm run db:test:prepare; npm run test:integration; npm run test:e2e:native. The expected native integration count is 59 (32 original + 27 workflow/socket cases, including two native-only race cases); this count is from definitions, not a passing final result. Native E2E runs the same 16 browser cases in two configs. Retain the outputs and inspect actual counts/failed/skipped results before calling the release fully verified on Windows.

## User-reported preserved baseline

M4 Windows 11/Node 24.21.0/PostgreSQL 18 on host port 5433: check/lint/build/doctor passed, 76 embedded backend passes with two native-only skips, React 21/21, native integration 51/51, browser 10/10 embedded and the same ten against native PostgreSQL, migration 002 applied and existing records preserved. These are supplied M4 results, not executed final-version results.

## Preservation and limits

No .env or credentials changed, no Docker operations/volume deletion or application data reset. Migrations 001/002, schema, transactional workflow/auth services and original unit/API assertions match M4; m5-preservation.json records hashes. No migration 003. Your actual Windows database was not accessible here; check existing reports after upgrading.

Remote CI, public deployment/TLS, Safari/Firefox/physical-device testing, screen-reader audit, full security/compliance review, durable notification delivery, distributed operation and comparative production performance are unverified. Ten axe scans do not prove complete WCAG compliance. No team review or hiring outcome is claimed.

## Debugging record

Live cached updates exposed duplicate sibling keys for action/history components, leaving old controls in the DOM. Distinct prefixes and a new regression case fix it. Unchanged filter submission initially reused a fresh cache and skipped the intended reload; explicit Apply now refetches. Combining all live test consumers exhausted the unchanged per-IP rate limit; isolated browser projects correct the test environment without changing application limits. These failures were resolved before final reports.

## Earlier M4 evidence (historical)

The following text describes the prior build only. Current final scope/results are above.

# Milestone 4 verification — 2026-10-12

## Executed here

Linux build environment, Node 24.19.0, npm 11.9.0; pinned dependencies and lockfile retained. Tests use synthetic data and random isolated schemas.

| Check                  | Actual result                                                 | Raw evidence                                       |
| ---------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| npm ci                 | Passed                                                        | evidence/m4-install.log                            |
| npm run check          | Passed                                                        | evidence/m4-typecheck.log                          |
| npm run lint           | Passed                                                        | evidence/m4-lint.log                               |
| npm test               | **76 passed, 2 skipped, 0 failed**                            | evidence/m4-backend-results.json; m4-backend.log   |
| npm run test:frontend  | **21/21 passed**                                              | evidence/m4-frontend-results.json; m4-frontend.log |
| npm run format:check   | Passed                                                        | evidence/m4-format-check.log                       |
| npm audit --json       | Zero reported known vulnerabilities; not a security guarantee | evidence/m4-dependency-audit.json                  |
| npm run build          | Passed                                                        | evidence/m4-build.log                              |
| Chromium browser suite | **10/10 passed**                                              | evidence/m4-browser-results.json; m4-browser.log   |

Backend total includes the preserved 59 M1–M3 tests and 17 new executed workflow/migration tests. The two skipped cases are native-only contention scenarios, not successful concurrency evidence. The frontend retains 13 original tests plus eight new ones. Browser count is the original six plus four serial steps in one multi-role lifecycle; do not describe those four as independent end-to-end products.

Executed migration checks: M3 report/history preserved after 002, repeated migrate is safe, incompatible existing assignee role rejects upgrade and rolls back DDL without deleting the report. Executed API checks: role/object authorization, assignment, invalid/stale transitions, complete resolve/reopen/close sequence, technician isolation, history/directory pagination, Origin/CSRF, note boundaries, database constraints, injected audit failure rollback. Browser checks cover actual Express actions, stale tab refresh, technician denial, resolution/reopen/closure and student progress.

Embedded database: PGlite 0.5.8 with pglite-socket 0.2.11 and real pg/Drizzle. Constraint checks use the direct embedded API where the existing adapter loses constraint errors; native branches use pg. Embedded execution is NOT native PostgreSQL and does not validate multi-connection races.

Browser: actual Chromium 153.0.8010.0, external @sparticuz/chromium runtime outside the project. Standard Playwright Chromium download failed (invalid archive); see m4-browser-install.log. The fallback is not a project dependency and is not bundled. Windows should use the standard Playwright-installed Chromium. No Safari/Firefox/accessibility certification is claimed.

## Native checks not executed here

No postgres, initdb or Docker executable and no configured TEST_DATABASE_URL were available; see evidence/m4-environment.json. Native PostgreSQL integration, native contention and native browser E2E were NOT executed for M4. No native-success report or invented race result is included.

`npm run test:integration` on your preserved Windows PostgreSQL 18 runs **51 database/API tests** (32 original + 19 workflow, including both native-only cases). This is the expected count from the test definitions, NOT a passing result. Each native contention case performs three fresh races between two distinct coordinators, using a separate lock holder and at least two waiting pg connections; assertions require one 200, one 409, one committed version increment and one matching event. See EVALUATION.md. It writes m4-native-results.json and m4-native-concurrency.json when run. `npm run test:e2e:native` runs the same ten browser scenarios with native PostgreSQL.

## User-reported Windows baseline

Before M4: M3 npm ci/check/lint/build passed; backend 59/59; native PostgreSQL integration 32/32; React 13/13; Chromium 6/6 and the same Chromium suite against native PostgreSQL 6/6. PostgreSQL 18 host port 5433 healthy. These are your supplied M3 results, not M4 execution results.

## Preserved and remaining

No .env was overwritten, no credentials printed, no Docker containers/volumes operated and no existing application data reset. Migration 001/auth/config/M1 policy tests and original browser tests remain intact; see m4-preservation.json. M2 integration setup now explicitly constructs the pre-002 schema for its existing legacy adoption assertion.

GitHub Actions is configured, not run remotely. Windows commands, backup/volume reuse steps, public deployment, TLS, load testing, comparative unsafe-baseline benchmarks and independent security review remain unverified. Audit is application-append-only, not tamper-proof. No assignment race outcome or production reliability improvement can be claimed until native execution evidence exists. Local test elapsed times are not application throughput/latency measurements.

Reproduction: README.md and WINDOWS.md. Retain the original archive before overwriting reports with your Windows runs.

## Historical Milestone 3 build record

The following is retained as history; it does not describe the current M4 scope.

# Milestone 3 verification — 2026-10-12

## Executed in this build environment

Linux, Node 24.19.0, npm 11.9.0. Exact dependencies are pinned in package.json and package-lock.json.

| Check                 | Result                                                              | Evidence                                              |
| --------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| npm ci                | Passed, 395 packages installed from lockfile                        | evidence/m3-install.log                               |
| npm run check         | Passed: backend, scripts, tooling, E2E types and strict React types | evidence/m3-typecheck.log                             |
| npm run lint          | Passed                                                              | evidence/m3-lint.log                                  |
| npm test              | 59/59 passed; original 20 foundation tests preserved                | evidence/m3-backend-results.json and m3-backend.log   |
| npm run test:frontend | 13/13 passed                                                        | evidence/m3-frontend-results.json and m3-frontend.log |
| npm run build         | Passed: TypeScript + Vite production bundle                         | evidence/m3-build.log                                 |
| npm run test:e2e      | 6/6 passed, no skips/retries/flaky outcomes                         | evidence/m3-browser-results.json and m3-browser.log   |

Database/API tests used PGlite 0.5.8 with pglite-socket 0.2.11 and real pg/Drizzle/Express. Browser tests also used this embedded engine in their own synthetic schema. **Neither is native PostgreSQL execution.** Existing direct embedded constraint assertions are retained; see the M2 record below.

Browser tests executed in Chromium **153.0.8010.0**, supplied by an external @sparticuz/chromium installation outside this project. The usual Playwright browser download failed because its CDN returned an invalid/empty archive in this environment. CAMPUSFIX_BROWSER_EXECUTABLE selected the external binary. It is not bundled or added as a project dependency. Windows should install the default Playwright Chromium; that exact bundled browser was not tested here. One desktop screenshot was visually inspected locally; no screenshot is shipped as evidence of accessibility compliance.

No .env, database credentials, Docker volumes or unrelated containers were modified. The initial SQL migration, backend services/auth rules, and original test assertions were preserved. The test pool's awaited onConnect initialization prevents overlapping initialization/query use; the specific reported pg deprecation warning was not reproduced, so warning elimination on Windows is not claimed.

## Reported by the user, not executed here

M2 on Windows 11: npm ci/check/build; 59/59 tests; PostgreSQL 18 healthy on host port 5433; migrate/seed/doctor/db:test:prepare; native integration 32/32. This establishes the supplied baseline but does not verify M3 on Windows.

## Remaining gates and limitations

- Run M3 checks, 32 native integration tests and 6 native browser tests on the preserved Windows/PostgreSQL environment.
- GitHub Actions updated but not run remotely; no deployed URL or TLS deployment was verified.
- No Safari/Firefox, screen-reader or comprehensive accessibility/security audit.
- No assignment/status-change APIs, concurrency evaluation, production-load measurement or live users.
- ESLint uses Babel TypeScript parsing plus React hook rules. It is not type-aware linting; TypeScript checking is a separate gate. Passing lint does not prove correctness.
- npm emits an environment-specific unknown http-proxy config warning; it did not prevent installation/build/tests. No project proxy setting was introduced.

## Reproduction

See README and WINDOWS.md. Build before browser tests. Default E2E uses an isolated embedded database; test:e2e:native reads existing .env and requires the separate *_test database. Reports are overwritten by a new run, so retain this archive if you want the original evidence. Test durations describe this local runner, not service latency or throughput.

## Historical M2 build record

The text below describes the earlier M2 build environment only; later user-reported Windows results and M3 results are listed above.

# Milestone 2 verification

Executed in the build environment on 2026-10-11. Node v24.19.0, npm 11.9.0. Exact installed dependency versions are in package.json/package-lock.json.

## Executed results

- TypeScript strict checking: passed.
- Vitest: **59/59 passed**, four test files: original 20 foundation tests, seven configuration tests, 32 database/API integration tests.
- TypeScript compilation: passed.
- Clean-directory npm ci, checking, test suite, compilation and formatting check: passed; dependencies were installed from the lockfile.
- Production dependency audit: zero reported known vulnerabilities. See dependency-audit.json. This is not a security certification.
- Integration backend: **PGlite 0.5.8, PostgreSQL WASM engine, with pglite-socket 0.2.11 and real pg/Drizzle queries. Not native PostgreSQL.**
- Executed fresh migration, rerun, and adoption of an untracked M1 schema; verified a pre-existing record survived.
- Verified login, hash storage, session expiry/logout/current-session rotation, cookie flags, origin/CSRF rejection, role/object authorization, strict input validation, filtering/pagination, database constraints, and transactional rollback on history failure.
- Original M1 tests, workflow policy and initial SQL migration match the original Git commit exactly.
- Raw test result artifact: test-results.json.

## Fixes found during implementation

Installed cookie and Drizzle APIs required parseCookie and accessMode respectively. Fixed compile errors before final verification. The embedded wire adapter closed a connection after a constraint error instead of reporting the expected next error. Embedded-only constraint assertions use the direct PGlite API; native mode uses pg for those same assertions. Explicit test connection search_path handles the embedded adapter's ignored startup options. These are test-harness adjustments, not substitutes for native verification.

## Not executed / remaining gates

- **Native PostgreSQL and Docker execution: not performed.** Native installation failed because this environment denied required user/group operations. No host workaround or permission escalation was used.
- Windows 11 commands: documented, not run here. User reported the original M1 checks passed on Windows; M2 needs a new Windows run.
- Remote GitHub Actions: configured, not run remotely.
- Cloud deployment/TLS: not performed.
- Full production security review, real multi-connection concurrency and assignment workflow evaluation: not performed.
- No React frontend, state-change HTTP APIs or real users yet.

## Reproduce

`npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`.

For native PostgreSQL: configure .env following WINDOWS.md, run `npm run db:test:prepare` then `npm run test:integration`. The native command will fail on missing configuration rather than silently using the embedded engine. See README for milestone boundaries.
