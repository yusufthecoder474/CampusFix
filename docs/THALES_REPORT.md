# Thales verification report

Verification date: 22 October 2026. This report distinguishes fresh executions
from historical milestone evidence included in the uploaded archive.

## Source and environments

- Input ZIP: `CampusFix_Final_VE3_ReactJS(2).zip`.
- ZIP SHA256: `5631a299a8dd4c2fb5be7e51bdd995bbf20287d65b9225dd539963242b24b508`.
- Original source: `c1b50a3099d5fbcadf8ed6e1b31bd11b4974094e`.
- Baseline documentation-only commit: `3ae9849991e55173f2978412ca7d5b26c49c479c`.
- Local scratch environment: Linux, Node v24.19.0, npm 11.9.0; no Docker or native
  PostgreSQL. Initial offline installation failed; a later online `npm ci`
  succeeded, allowing the local checks below.
- Hosted environment: GitHub Actions Ubuntu 24.04.5, Node v24.21.0, npm
  11.19.0, Docker 28.0.4, Compose v2.38.2, disposable PostgreSQL 18.6 and
  Playwright Chromium. Exact versions and commands are in the
  raw run logs and generated `run.json`.

## Fresh baseline

[Baseline run](https://github.com/yusufthecoder474/CampusFix/actions/runs/39788918217)
failed overall. Type checks, lint and formatting passed. Default backend:
84 passed, 2 skipped. React: 29 passed. Native PostgreSQL: 59 assertions passed,
but the suite failed teardown with ENOENT writing
`docs/evidence/m5-native-concurrency.json`. Build and browser steps were skipped.
The missing evidence directory in a clean checkout is fixed by this change.
Raw support: `docs/evidence/thales/baseline-ci.log`.

## Current verification

The complete [hosted push run 39823814342](https://github.com/yusufthecoder474/CampusFix/actions/runs/39823814342)
passed at source revision `57e16956c9f6e76fb847278e59e037bd52d9732f`.
This run checked the committed source directly; the temporary formatter step used
during implementation had been removed. The subsequent runner-only change at
`cbfdd92e5d662f211a7a4d2d44673b152d3eefaf` additionally provides Compose an
explicit empty environment file so it cannot discover an application `.env`.
The final [hosted push run 39824085048](https://github.com/yusufthecoder474/CampusFix/actions/runs/39824085048)
also passed every check at that exact revision, with the same test counts below.
The environment versions above refer to this final code run. The earlier run
used Node v24.22.0/npm 11.19.1; each raw manifest records its own environment.
Subsequent documentation/evidence updates do not change executable source.
`verified-source-manifest.json` records SHA256 and Git blob hashes for 72
code/configuration files, all compared with the successfully tested Git tree.

| Check                       | Hosted result                      | Local result                   | Database / scope                                                         |
| --------------------------- | ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| TypeScript, lint, format    | Passed                             | Passed                         | Backend and frontend sources                                             |
| Default backend             | 90 passed, 0 failed, 3 skipped     | 90 passed, 0 failed, 3 skipped | PGlite; native races explicitly skipped                                  |
| React                       | 30 passed, 0 failed, 0 skipped     | 30 passed, 0 failed, 0 skipped | jsdom and API/socket fixtures                                            |
| Native integration          | 65 passed, 0 failed, 0 skipped     | Not executed                   | Actual PostgreSQL 18.6, separate backend connections                     |
| Build                       | Passed                             | Passed                         | TypeScript and Vite                                                      |
| Browser regression/workflow | 10 passed, 0 failed, 0 skipped     | Not executed                   | Chromium with native PostgreSQL                                          |
| Browser realtime/reconnect  | 6 passed, 0 failed, 0 skipped      | Not executed                   | Independent contexts, offline recovery and viewport/axe scenarios        |
| Production dependency audit | Passed, 0 reported vulnerabilities | Not executed separately        | `npm audit --omit=dev --audit-level=high`, point-in-time advisory result |
| Owned database cleanup      | Passed                             | No database created            | Unique task container and network removed                                |

Do not add these suite counts into a unique-test total: native integration repeats
many tests from the default backend run. No coverage collector was configured.
The three default skips are two parameterized native race cases and the native
session-isolation regression. They all execute in the native phase.

### Exact commands and raw support

CI ran `npm ci`, `npx playwright install --with-deps chromium`,
`npm run verify:disposable -- --skip-install --skip-browser-install` and
`npm audit --omit=dev --audit-level=high`. The runner's `run.json` records every
child command, exit code, duration, project name and source revision, including:

```bash
npm run check
npm run lint
npm run format:check
npm test -- --reporter=default --reporter=json --outputFile=<run-dir>/backend.json
npm run test:frontend -- --reporter=default --reporter=json --outputFile=<run-dir>/frontend.json
node --import tsx scripts/test-native.ts
npm run build
node --import tsx scripts/e2e-native.ts
```

`<run-dir>` is the absolute evidence directory recorded in the manifest, not a
literal shell argument. The native scripts invoke Vitest for the two integration
files and Playwright for both configurations with native mode enabled.

Raw logs and JSON are bundled below `docs/evidence/thales/ci-cbfdd92/`
and the earlier `ci-57e1695/` folder.
The downloaded CI artifact SHA256 is
`d511efe51267085a319af22698481946d48495e6ce44a3fd55266e4058d0fa16`.
The final artifact SHA256 is
`df3487706d90e0ed0d1be96fa571336e106be310dba5347a413e2929c5f5cf4a`.
Full job logs are `verified-ci-cbfdd92.log` and `verified-ci-57e1695.log`;
local summaries and logs are in
`docs/evidence/thales/local-*`. Generated screenshots remain in the linked CI
artifact; raw result JSON and command logs are included in this deliverable.

The native race JSON contains seven scenarios: three assignment, three triage
and one assignment with REPEATABLE READ session defaults. Each records two
distinct lock-waiting request PIDs, their blockers, equal starting versions,
statuses 200/409, STALE_VERSION, final state and exactly one matching audit event.
The tests also assert the winning actor and contiguous audit versions. This is
observed database contention, rather than sequential request simulation.

### Failures corrected during implementation

The first implementation CI attempt caught an erroneous extra argument on an
audit insert; it failed type checking and was corrected before successful runs.
The next caught two unused test-variable initializers in lint. Locally, an
existing login test found the error element before its focus effect had settled;
it now waits for the focus assertion, preserving the UI behavior. Initial failed
logs are retained separately from the corrected results. No failed result is
counted as a pass. Local disposable prerequisite checks stop safely because
Docker is absent; their manifests record that failure.

## Evidence matrix

Results below refer to the successful final hosted code run above.

| JD skill                 | Code location                                    | Test/command                                                 | Result                                      | Limitation                                        |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------- |
| Databases and atomicity  | src/requests/workflow.ts; db/002_workflow.sql    | Native integration; injected audit failure                   | Passed: 65 native tests                     | Synthetic fixtures, one PostgreSQL instance       |
| Concurrent requests      | tests/workflow-api.test.ts controlledRace        | Native two-writer assignment/triage and isolation regression | Passed: seven observed races                | Seven controlled races do not cover all schedules |
| Networking               | src/realtime.ts; web/src/live.tsx                | Actual Socket.IO clients; native browser reconnect           | Passed: socket and 6 realtime browser cases | WebSocket only, one server, no durable replay     |
| Authorization and errors | src/api.ts; src/auth/service.ts; src/app.ts      | Role/ownership, CSRF, body limit and socket revocation tests | Passed in backend/native suites             | Focused cases, not a complete security audit      |
| Linux and automation     | scripts/verify-disposable.mjs; compose.test.yaml | Disposable runner in Ubuntu CI                               | Passed, including owned cleanup             | Windows documented, not executed                  |
| Testing and build tools  | .github/workflows/ci.yml; web/tests; e2e         | Type check, lint, format, Vitest, Playwright, build          | Passed: all listed suites                   | Coverage not measured; no production load test    |
| Technical communication  | docs/THALES_FLOWS.md; docs/THALES_INTERVIEW.md   | Source-based diagrams and explanations                       | Reviewed against code                       | No external team review claimed                   |

## Limits and unmeasured behavior

Coverage percentage, query speedup, API latency, uptime, production load, TLS
deployment, cloud operation, Kubernetes and team code review are not measured or
claimed. There is no demonstrated query-performance issue, so no new index or
benchmark percentage was added. Browser checks cover selected scenarios and
viewports, not every browser or accessibility requirement. Local prerequisite
failure is not a successful local suite. Historical counts remain historical.
