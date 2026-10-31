# Safe migration rollback verification

CampusFix already uses `scripts/migrate.ts` to apply SQL migrations in a
transaction with an advisory lock and SHA-256 checksums. This additional
regression check verifies those guarantees without changing production code.

## Scenario

`scripts/verify-migrations.ts` creates a **uniquely named temporary schema**
inside an explicitly local database ending in `_test`.

1. Applies Milestone 1 (`001_initial.sql`) and stores a synthetic user row.
2. Deliberately adds the `version` column that Milestone 2 would introduce.
3. Runs Milestone 2 and asserts it fails without partially changing the schema.
4. Confirms migration history and the existing user row are unchanged.
5. Removes the injected conflict, applies Milestone 2 twice, and checks history.
6. Tampers with a migration checksum and verifies drift detection rejects it.
7. Drops only the temporary schema, including in failure cleanup.

### Run locally with a disposable PostgreSQL test database

```sh
TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/campusfix_test \
  node --import tsx scripts/verify-migrations.ts
```

The GitHub Actions PostgreSQL service runs the same command on pull requests.
**Never point the verifier at production:** it rejects non-local hosts and
database names not ending in `_test`.

### Scope

This test verifies **transactional schema rollback and data preservation in a
dedicated test schema**. It is not evidence of production zero downtime,
application compatibility during a live rollout, a reverse schema migration, or
automated restoration of all historical database versions.
