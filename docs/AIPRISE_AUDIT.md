# Backend extension decision

## Existing evidence

CampusFix baseline: commit `c1b50a3099d5fbcadf8ed6e1b31bd11b4974094e`.

| Requirement                           | Source evidence                                     | Status before extension                                      | Remaining gap                                                    |
| ------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Backend REST APIs                     | `src/api.ts`, `src/requests/service.ts`             | Source inspected                                             | Full regression passed on migration 003                          |
| Authentication and server permissions | `src/auth/service.ts`, `src/api.ts`                 | Source inspected                                             | External security assessment not performed                       |
| Transactional case workflow           | `src/requests/workflow.ts`, `db/002_workflow.sql`   | Source and historical native logs inspected                  | Recorded Linux release acceptance passed                         |
| PostgreSQL concurrency                | Row locks, expected versions, unique audit versions | Historical native race assertions passed                     | New queue claim races passed native tests                        |
| React reviewer interface              | `web/src/Requests.tsx`, `web/src/Workflow.tsx`      | Source inspected                                             | No new screenshots produced; native browser checks passed        |
| Live updates                          | `src/realtime.ts`, `web/src/live.tsx`               | Source and historical tests inspected                        | Signals remain ephemeral                                         |
| Durable delivery                      | Missing at baseline                                 | Added by this extension                                      | Verified native SQL integration; longer failure studies deferred |
| Provider adapters                     | Missing at baseline                                 | Two synthetic HTTP contracts added                           | No real vendor integration                                       |
| CI                                    | `.github/workflows/ci.yml`                          | Configured; baseline hosted job failed during evidence write | Successful hosted run 39456233174 verifies the fix and extension |
| Deployment                            | Original Compose provisioned database only          | Application Dockerfile and optional delivery stack added     | Built image/smoke test passed; public deployment unverified      |

## Why extend this project

An independent VerifyFlow application would require another identity model, onboarding schema, case UI, authentication system and deployment path. Those are worthwhile if compliance simulation becomes the product goal, but they are not the fastest way to demonstrate the missing integration and asynchronous-delivery patterns.

CampusFix already has role-restricted state transitions, a versioned audit stream and a React interface. Adding a provider delivery path gives these patterns a practical maintenance-workflow use case. It does **not** make CampusFix a compliance system. Regulated onboarding, risk scoring and real KYC/KYB/AML knowledge remain separate gaps.

## Historical CI defect

[Run 38352728076](https://github.com/yusufthecoder474/CampusFix/actions/runs/38352728076), job 115148562160, passed all 59 native PostgreSQL assertions. The suite failed in `afterAll` when `writeFile` tried to create `docs/evidence/m5-native-concurrency.json` before its parent directory existed. Build and browser steps were subsequently skipped.

The patch creates the directory in the native runner and in teardown, and ensures resource cleanup executes through `finally`. This diagnosis is verified from hosted logs. The fix is source-reviewed and syntax-checked locally. [Successful full run](https://github.com/yusufthecoder474/CampusFix/actions/runs/39456233174) now verifies the native, frontend, browser and built-container gates.

## Acceptance order

1. Core adapter/worker checks must pass without npm dependencies.
2. Native PostgreSQL acceptance must establish atomic trigger insertion, rollback, competing claims, stale-lease fencing, fallback pinning and transactional receipts.
3. Existing backend, React and native-browser suites must pass against migration 003.
4. Docker must start the app and worker against a reachable synthetic database.
5. Deployment is optional and requires a concrete resource inventory and approved cost first.

Do not replace failed or unavailable gates with historical results. [Test status](OUTBOX_TESTING.md) records the current evidence.
