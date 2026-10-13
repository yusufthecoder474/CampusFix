# M4 correctness evaluation

Question: do row locking, optimistic versions and transactional history prevent conflicting coordinator assignments and duplicate triage decisions in this implementation?

## Executable native experiment

`npm run test:integration` runs two native-only scenarios, each repeated three times on fresh synthetic requests. Two distinct coordinator accounts compete: assignment targets different technicians; triage duplicates the same requested transition. A separate pg connection holds SELECT FOR UPDATE on the target. Both HTTP calls are started, and pg_stat_activity must show at least two connections waiting on locks before release. The poll clears the statistics snapshot each time. Pool maximum is five; this is not a single queued client masquerading as concurrent work.

Assertions: exactly one 200 and one 409, one version increment in persisted state, one matching event, and assignment owner equals the winner. Record server version, waiting actors, response statuses, event count and version in m4-native-concurrency.json. Missing contention fails the test. Three repetitions are deterministic regression checks, not a statistical reliability estimate. No native results are claimed unless the file comes from an executed native run and assertions pass.

## Other controls

Sequential valid/invalid transitions, duplicate/stale actions (including stale resolve after reopen), role/object isolation, migration upgrade/rerun, incompatible migration rollback, database constraints and injected audit failure are covered separately. Embedded tests validate these logical cases but not multi-connection scheduling. React/browser tests validate conflict refresh and consistent role journeys.

The earlier proposed unsafe-baseline comparison and 30-run 2/5/10-actor benchmark have NOT been implemented or evaluated in M4. No improvement percentage, novelty, throughput or production reliability claim is supported. This milestone is a correctness test suite, not a comparative research study.

Limits: synthetic fixtures, one application, short workloads, no distributed server/failover experiment, no power-loss test, no production traffic. Follow-up native workload expansion is optional after the basic Windows gate passes. PostgreSQL row locking/version checks are established techniques, not a new algorithm.
