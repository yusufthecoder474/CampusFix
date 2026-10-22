# Focused engineering audit

## Source and scope

The uploaded CampusFix ZIP is the source of truth; its executable sources match
main revision `c1b50a3099d5fbcadf8ed6e1b31bd11b4974094e`. The uploaded archive's
SHA256 and baseline provenance are in THALES_BASELINE.md. No repository
AGENTS.md instructions were found. This work is isolated on
`codex/thales-transactions-networking`, with a draft pull request to main.
Existing UI components, development credentials, database migrations and the ISC
package declaration are preserved. The archive contains no standalone LICENSE.

## Transaction correctness

The original workflow already locks a request with SELECT FOR UPDATE, checks
ownership and expectedVersion, validates the transition, conditionally updates
the version and inserts the audit event inside one transaction. Assignment also
locks the technician row FOR SHARE and has a database foreign-key safeguard.
The implementation retains those protections.

The workflow previously inherited connection-default isolation. Under a
REPEATABLE READ session default, a writer waiting on an updated row can encounter
a serialization failure instead of the intended stale-version response. The
focused fix explicitly selects READ COMMITTED for this transaction. A native
regression test uses a separate pool whose session default is REPEATABLE READ
and checks the same controlled two-writer outcome. Read-only pagination
transactions retain REPEATABLE READ so items and totals share a snapshot.

The enhanced tests observe two lock-waiting PostgreSQL backend PIDs before
releasing a third connection's blocker. They assert both clients began at the
same version, one 200, one 409 STALE_VERSION, the final version/state/assignee and
the winner's audit event. Assignment and triage run three times each, plus the
session-default regression. The winner is not prescribed. A separate injected
audit constraint failure verifies rollback by comparing the complete row.

## Authorization, API and database boundaries

Sessions store hashed tokens and use database-backed authentication. Write
routes require JSON, exact Origin and CSRF. Services enforce role and ownership
rules; forbidden roles fail before private record lookup, and unrelated records
are concealed. Strict schemas reject mass assignment. Queries parameterize user
values. Existing migration tests check safe reruns, legacy history preservation
and rollback of incompatible upgrades.

New assertions cover complete absence of changes after a forbidden workflow
action, pagination limits/duplicate parameters/empty high pages with scoped
totals, and a 413 oversized-body response without internal details. Existing
tests cover missing authentication, invalid CSRF, transitions, target technician
validation, malformed input and audit uniqueness. These are focused examples,
not a claim of exhaustive security assurance.

No demonstrated slow query justified an index change. No EXPLAIN ANALYZE
benchmark, query speedup, end-to-end latency, coverage percentage or production
capacity claim is made.

## Networking

Both ends explicitly allow WebSocket only. Origin, session and CSRF protect the
connection. The server has no client room-join capability and filters every
published hint using fresh authorization. Publication follows commit. There is
no outbox in this input and none was added. New tests check polling rejection,
fabricated sessions, role-change revocation and implicit-room membership;
ordered test markers strengthen negative-delivery checks. Reconnect cache
invalidation is tested in React and actual offline/reconnect behavior remains
covered by the existing browser scenarios. See THALES_NETWORKING.md.

## Automation and baseline defect

A clean baseline CI checkout passed its native assertions but failed teardown
while writing evidence to a missing directory. The native runner and teardown
now create the evidence destination. A unique disposable Compose project and
temporary PostgreSQL cluster support one command for checks, real database
tests and browser suites. Logs survive failures; cleanup targets only resources
created by that run. The CI workflow uses the same runner and uploads diagnostics.

The scratch host lacks Docker/PostgreSQL. Its initial offline npm cache was
incomplete; online installation subsequently succeeded and enabled local embedded
and React tests. Local Docker prerequisite failure is recorded separately from
actual successful hosted CI results. Windows instructions are supplied but Windows execution is unverified.
