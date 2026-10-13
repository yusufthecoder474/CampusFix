# Test commands and what they prove

```powershell
npm ci
npm run check
npm run lint
npm test
npm run test:frontend
npm run build
npm run measure:bundle
npm run test:realtime
npx playwright install chromium
npm run test:e2e
npm run test:e2e:realtime
npm run db:test:prepare
npm run test:integration
npm run test:e2e:native
npm audit
```

Backend default tests retain M1/M4 behavior and run eight actual Socket.IO checks. Embedded PGlite validates authorization/transactions/API behavior but is single-connection; two native-only race cases are skipped there. Native integration uses a separate *_test database and observes two actual connections waiting on a held row lock before asserting one winner. No application tables/volumes are reset.

React tests retain the original 21 behavioral cases; provider wrappers and confirmation interactions are added without removing original assertions. Additional tests cover query caching/invalidation, version deduplication, listener cleanup, router/session gates, confirmation cancellation and the duplicate-key live-update regression.

Default Playwright has regression and workflow projects on separate isolated servers. This avoids combining all live consumers/scenarios into the same per-IP rate-limit bucket. Production rate limits are unchanged. Realtime/responsive tests use another fresh server and four authenticated contexts. Native E2E runs both configs sequentially. Ports: E2E_PORT=4310, WORKFLOW_E2E_PORT=4311, REALTIME_E2E_PORT=4313; all can be changed to free ports.

Axe scans dashboard/form at 375, 768, 1024 and 1440 pixels plus assignment/closure dialogs. Keyboard dialog focus and form tab order are checked. Tests save synthetic screenshots and summarized findings. These scans are not full accessibility compliance verification.

If Windows workers run out of memory:

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism
npm run test:frontend:serial
```

Browser workers remain one. Native database tests and browser tests use random disposable schemas; migration negative fixtures are also isolated. Synthetic fixture passwords are intentionally nonsecret and never used as application credentials. Reports are overwritten by new runs; retain original evidence separately. CI is configured, not claimed to have run remotely.
