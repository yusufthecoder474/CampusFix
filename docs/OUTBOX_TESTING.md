# Outbox verification report

Verified on 20 October 2026. [Successful full hosted run](https://github.com/yusufthecoder474/CampusFix/actions/runs/39456233174) tested implementation commit `26fd8dd67088ee6be65f2893d68608fedb59ab46`. New tests are separate from historical CampusFix totals. [Machine-readable ledger](evidence/outbox-ci-verification.json) records scope. Later documentation-only commits do not change the tested implementation.

| Gate                                  | Result                                       | Interpretation                                               |
| ------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| Adapter and worker suite              | 29 passed, 0 failed, 0 skipped               | Local and hosted; includes actual loopback HTTP              |
| Loaded extension line coverage        | 93.75% locally                               | Only imported policy, providers, worker and mock modules     |
| Loaded extension branch coverage      | 88.39% locally                               | Same restricted scope                                        |
| Native outbox acceptance              | 7 scenarios passed plus parent test          | Native PostgreSQL; not an embedded substitute                |
| Default backend suite                 | 84 passed, 2 skipped                         | Two native-only races intentionally skipped in embedded mode |
| React suite                           | 29 passed                                    | Existing frontend regression                                 |
| Existing native integration suite     | 59 passed, no skips                          | Includes native races; overlaps default database scenarios   |
| Native browser suites                 | 10 workflow/regression and 6 realtime passed | Actual Chromium against native PostgreSQL                    |
| Typecheck, lint, formatting and build | Passed in hosted CI                          | Exact tested implementation SHA above                        |
| Container acceptance                  | Passed                                       | Built image; API readiness and one worker/mock/PG delivery   |
| Production dependency audit           | Zero vulnerabilities reported in that run    | Time-specific scan, not a security guarantee                 |
| Local dependency installation         | Blocked                                      | Hosted CI supplied the missing environment                   |
| Public cloud / Windows runtime        | Not verified                                 | No deployment or Windows-specific execution claimed          |

Coverage excludes unimported `store.mjs`, `run.mjs`, benchmark code, native integration tests, and the existing application. It is not whole-project coverage. The worker tests use a small injected store; they do not establish PostgreSQL behavior.

Raw check output: [outbox-core.txt](evidence/outbox-core.txt). Reproduce:

```powershell
node --test --experimental-test-coverage extension/tests/core.test.mjs
node --env-file=.env --test extension/tests/postgres.integration.mjs
```

The native suite passed in hosted CI and remains reproducible with a dedicated `_test` database. Its seven scenarios cover queue creation, source/outbox rollback, induced outbox failure, competing workers, lease fencing and fallback pinning, receipt rollback, durable retries and terminal-failure visibility. It creates a random schema and cleans it up; it never substitutes SQLite or PGlite.

## HTTP benchmark

Three runs, each with 100 sequential requests to a local mock provider on the same host. These include real HTTP serialization/transport and response normalization. No concurrent load, public API, database, queue, Docker or cloud path is measured. The first sample is included; no warmup samples are discarded. Median is sorted sample index 49 and p95 is index 94, using nearest-rank percentiles for 100 samples.

| Run | Requests | Errors | Median ms | p95 ms | Maximum ms |
| --- | -------: | -----: | --------: | -----: | ---------: |
| 1   |      100 |      0 |     1.976 |  3.272 |     22.705 |
| 2   |      100 |      0 |     1.761 |  2.507 |      3.196 |
| 3   |      100 |      0 |     1.733 |  2.235 |      3.187 |

Raw samples and timestamp: [benchmark JSON](evidence/outbox-benchmark.json). Run `node extension/benchmark.mjs` to collect a new measurement. Results vary by machine and are not resume claims about production performance.

No end-to-end queue latency, measured failover-recovery time, native duplicate-event success rate or complete application error-rate distribution was collected. The HTTP timeout check tests classification, not a performance service-level objective.

## Remaining failure scenarios

Native tests establish the specified SQL behavior in the recorded environment. Longer exercises should cover worker kill after external acceptance, database failover during acknowledgement, multi-process saturation, lease expiration during slow connections, persistent provider deduplication, queue pruning and load-driven fairness. The current queue can finish events out of order and is not a strict FIFO service.

Security review remains code-level. Tests exercise payload redaction and endpoint restrictions in the new adapters; inherited authentication, authorization, CSRF and rate-limit regressions passed in the recorded hosted suite. This is not an external security assessment.
