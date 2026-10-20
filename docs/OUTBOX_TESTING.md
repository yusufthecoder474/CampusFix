# Outbox verification report

Measured locally on 20 October 2026, Node 24. The new tests are separate from historical CampusFix totals.

| Gate                                            | Result                         | Interpretation                                                  |
| ----------------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| Adapter and worker suite                        | 29 passed, 0 failed, 0 skipped | Includes actual loopback HTTP and isolated worker tests         |
| Loaded extension line coverage                  | 93.75%                         | Only imported policy, providers, worker and mock-server modules |
| Loaded extension branch coverage                | 88.39%                         | Same restricted scope                                           |
| Syntax checks                                   | Passed                         | New MJS files plus modified migration and native test TS        |
| Full dependency installation                    | Blocked                        | npm registry unreachable; offline cache lacks required packages |
| New native PostgreSQL tests                     | Not run                        | Neither native PostgreSQL nor Docker available locally          |
| Full application typecheck, lint and regression | Not run                        | Dependencies unavailable                                        |
| New Docker build/runtime                        | Not run                        | Docker unavailable                                              |
| New hosted CI / cloud                           | Pending                        | No successful new run is claimed by this report                 |

Coverage excludes unimported `store.mjs`, `run.mjs`, benchmark code, native integration tests, and the existing application. It is not whole-project coverage. The worker tests use a small injected store; they do not establish PostgreSQL behavior.

Raw check output: [outbox-core.txt](evidence/outbox-core.txt). Reproduce:

```powershell
node --test --experimental-test-coverage extension/tests/core.test.mjs
node --env-file=.env --test extension/tests/postgres.integration.mjs
```

The native suite is an explicit gate and fails without a dedicated `_test` database. Its seven scenarios cover queue creation, source/outbox rollback, induced outbox failure, competing workers, lease fencing and fallback pinning, receipt rollback, durable retries and terminal-failure visibility. It creates a random schema and cleans it up; it never substitutes SQLite or PGlite.

## HTTP benchmark

Three runs, each with 100 sequential requests to a local mock provider on the same host. These include real HTTP serialization/transport and response normalization. No concurrent load, public API, database, queue, Docker or cloud path is measured. The first sample is included; no warmup samples are discarded. Median is sorted sample index 49 and p95 is index 94, using nearest-rank percentiles for 100 samples.

| Run | Requests | Errors | Median ms | p95 ms | Maximum ms |
| --- | -------: | -----: | --------: | -----: | ---------: |
| 1   | 100      | 0      | 1.976     | 3.272  | 22.705     |
| 2   | 100      | 0      | 1.761     | 2.507  | 3.196      |
| 3   | 100      | 0      | 1.733     | 2.235  | 3.187      |

Raw samples and timestamp: [benchmark JSON](evidence/outbox-benchmark.json). Run `node extension/benchmark.mjs` to collect a new measurement. Results vary by machine and are not resume claims about production performance.

No end-to-end queue latency, measured failover-recovery time, native duplicate-event success rate or complete application error-rate distribution was collected. The HTTP timeout check tests classification, not a performance service-level objective.

## Remaining failure scenarios

Native tests must prove the SQL behavior already specified. Longer exercises should cover worker kill after external acceptance, database failover during acknowledgement, multi-process saturation, lease expiration during slow connections, persistent provider deduplication, queue pruning and load-driven fairness. The current queue can finish events out of order and is not a strict FIFO service.

Security review remains code-level. Tests exercise payload redaction and endpoint restrictions in the new adapters; inherited authentication, authorization, CSRF and rate limits need the full regression suite on this patch before publication as a verified release.
