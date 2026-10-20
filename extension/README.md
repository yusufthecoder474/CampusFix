# CampusFix durable workflow delivery

This extension keeps CampusFix's existing student, coordinator and technician workflows. It adds a durable record of each new workflow event and sends a minimal change notification to two **simulated maintenance-service providers**. Neither adapter connects to a real company. This is not a compliance, KYC, KYB, AML or sanctions-verification product.

## Why this change

The existing API commits a request and its audit event before attempting a Socket.IO update. If the process fails after commit, the change remains saved but the live signal can disappear. Socket reconnect restores current REST state; it does not replay a durable notification history.

The outbox records delivery work inside the source transaction. A separate worker retries delivery without making the user wait for a provider. Socket.IO continues to provide immediate hints; this worker delivers a separate simulated provider notification, **not durable browser notifications**.

## Start here

1. Read [the source audit](../docs/AIPRISE_AUDIT.md) and [acceptance status](../docs/OUTBOX_TESTING.md).
2. Run `node --test extension/tests/core.test.mjs` with Node 24. No npm installation is needed for these tests.
3. For PostgreSQL integration and the real worker, install the existing locked dependencies with `npm ci`.
4. Follow [Windows setup and deployment](../docs/OUTBOX_DEPLOYMENT.md). Preserve the existing `.env`, database credentials and Compose volume.

## Modules

| Module                           | Responsibility                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `db/003_outbox.sql`              | Queue schema, unique receipts, transactional audit trigger                             |
| `store.mjs`                      | Atomic claim, lease fencing, transactional acknowledgement                             |
| `providers.mjs`                  | Distinct HTTP contracts, normalization, bounded response reads, timeout classification |
| `policy.mjs`                     | Bounded exponential backoff with jitter and terminal decisions                         |
| `worker.mjs`                     | One delivery attempt and state handling                                                |
| `run.mjs`                        | Poll loop, shutdown, redacted logs and status CLI                                      |
| `mock-providers.mjs`             | Local synthetic providers with per-process idempotency checks                          |
| `tests/core.test.mjs`            | Worker policy and actual loopback HTTP checks                                          |
| `tests/postgres.integration.mjs` | Native transaction, rollback, concurrency and receipt tests                            |

The extension uses standard Node modules and the repository's existing `pg` dependency. No Redis, broker, cloud account or additional paid service is required.

## Delivery contract

- New audit insertion and queue insertion share a PostgreSQL transaction. Trigger failure aborts the source write. No old events are automatically replayed.
- A worker claims one due event using `FOR UPDATE SKIP LOCKED`, a random lease token and a 30-second lease. The claim commits before HTTP.
- A provider call has a 1.5-second timeout. At most five provider-attempt cycles are allowed; expired claims also consume this budget. Each cycle may make two HTTP calls only when explicit fallback is allowed.
- Requests carry `Idempotency-Key: campusfix-event-<id>`. Acknowledgement writes the normalized receipt and delivery state in one database transaction. The lease token prevents an old worker from acknowledging a new claimant's work.
- The system provides retryable, **at-least-once attempts within a finite budget**, with possible duplicate requests after a timeout or crash. It does not promise eventual success or exactly-once external effects.
- Unique receipt keys prevent duplicate local receipt rows. Real external duplicate suppression depends on the provider's durable idempotency contract. The included mocks remember keys only until their process restarts.
- Before fallback is sent, the production worker pins Desk B in PostgreSQL under its lease token. Redelivery stays on Desk B even if Desk A recovers; this prevents switching providers after a lost acknowledgement. Standalone adapter tests without a store do not prove this persisted guarantee.
- Primary HTTP 503 allows fallback only because the mock contract explicitly means “not accepted.” A timeout, 429 or ambiguous 5xx retries the same primary provider. Generic real-world 503 responses cannot safely be assumed unaccepted.
- Different events can finish out of order. Consumers must use request versions when building projections. Neither FIFO delivery nor a global ordering guarantee is claimed.
- Terminal failures remain in `workflow_outbox` with `status='dead'`. No public replay API exists. An operator must diagnose and explicitly requeue after checking provider acceptance; automatic replay could repeat effects.

## Demonstration

Keep the application and database running. In another PowerShell window:

```powershell
node extension/mock-providers.mjs
```

In a third window, from the same project folder:

```powershell
node --env-file=.env extension/run.mjs
```

Create or change a synthetic maintenance request in the existing React interface. Inspect queue counts without showing payloads:

```powershell
node --env-file=.env extension/run.mjs --stats
```

For primary-failure fallback, restart the mock server with `$env:MOCK_PRIMARY_UNAVAILABLE = '1'`. This is a process-wide setting for a local exercise. Remove it afterwards with `Remove-Item Env:MOCK_PRIMARY_UNAVAILABLE`.

## Evidence boundaries

The adapter/worker checks ran locally and in [successful hosted CI](https://github.com/yusufthecoder474/CampusFix/actions/runs/39456233174). Seven new native PostgreSQL scenarios, the existing backend/React/native suites, 16 native browser checks and a built-container smoke test passed. The default backend run skipped two native-only races; the native run covered them separately. Public cloud deployment and Windows runtime checks remain unverified. Historical results are not relabeled as extension results. [The test report](../docs/OUTBOX_TESTING.md) distinguishes measured results from acceptance gates.

## Screens and architecture

The existing [React dashboard](../web/src/Requests.tsx) and [workflow screen](../web/src/Workflow.tsx) remain the user interface. Existing screenshots are linked from the root README; no new rendered UI or cloud screenshot is claimed. [Architecture diagrams](../docs/OUTBOX_ARCHITECTURE.md) show the queue and provider path.

## License

The repository already declares ISC in `package.json`. This extension preserves that declaration. No additional rights are assigned to third-party material; dependency licenses remain separate.
