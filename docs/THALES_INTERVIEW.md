# CampusFix interview answers

Use these as explanations of an independent portfolio project. Describe only
the features you understand, and do not present the demo as employment or
production experience. Test counts and run links belong in THALES_REPORT.md.

## Why PostgreSQL?

An issue has related users, an assignee and an ordered audit history. PostgreSQL
lets me express those relationships with foreign keys and constraints, and keep
a request update and its audit event in one transaction. It also provides row
locks for concurrent edits. This project demonstrates those capabilities; it
does not prove PostgreSQL is faster than every alternative.

## What are transactions and atomicity?

A transaction groups database work into one unit. Here an action updates the
request and inserts its audit event. Both commit, or both roll back. I inject an
audit insertion failure in a test and compare the entire request row before and
after; the failed action leaves no changed request or success audit entry.

## Row locks versus version checks?

The row lock makes conflicting writers take turns while examining a request.
The expected version tells me whether the user's decision was based on the
current state. I need both: taking turns alone would still allow the second user
to overwrite a decision made after their screen loaded. READ COMMITTED lets the
waiting writer inspect the newly committed row before checking its version.

## Why HTTP 409?

The request can be well-formed and the user authorized, yet conflict with the
current resource state. An old expectedVersion produces 409 STALE_VERSION. The
frontend refreshes authoritative state so the user can review the change. I do
not silently retry a conflicting human decision against a different version.

## What if two users edit the same issue?

They may both read version 1. PostgreSQL lets one hold the issue row lock first.
That transaction validates its action, writes version 2 and its audit event, and
commits. The waiting transaction sees version 2, rejects expectedVersion 1 and
returns 409. Tests deliberately block two distinct database connections before
releasing them; exactly one HTTP action succeeds and its audit matches the row.
Which user wins depends on lock acquisition, not a fixed priority rule.

## How is authorization enforced?

The server authenticates a hashed session token and obtains the user's role from
the database. Workflow services check roles, reporter ownership and technician
assignment. Strict schemas prevent users from adding arbitrary update fields.
Unrelated records are concealed where applicable. Socket recipients are checked
again against current session and request access; hiding a button is not the
security boundary.

## HTTP versus WebSocket?

HTTP is used for login, reads and commands with explicit status responses.
Socket.IO uses a persistent WebSocket connection for compact change hints sent
by the server. Hints tell the frontend to fetch authoritative data through REST;
they do not change records or replace authorization on REST requests.

## Which Socket.IO transports are enabled?

Both ends explicitly enable WebSocket only. There is no long-polling fallback
and no initial polling upgrade. Socket.IO supplies its own connection and event
protocol over WebSocket. The handshake checks exact Origin, the session cookie
and CSRF token. A blocked WebSocket connection therefore cannot fall back to
polling in this project.

## How does reconnect restore correct state?

Every connect invalidates list, detail and history caches. Active REST queries
fetch current data even if a hint was missed offline. Browser tests disconnect
one client, change the issue through another, reconnect and check the displayed
state. Notifications are in memory and missed notifications are not replayed.

## What do the automated tests establish?

Unit tests check policy and validation; embedded PGlite tests exercise SQL-backed
application behavior but do not establish native lock concurrency. Native
PostgreSQL tests observe separate blocked connection PIDs, committed state,
conflicts, audit history and rollback. Actual socket clients check access and
delivery behavior, React tests check hook/cache behavior, and browser contexts
check visible workflows and reconnect. Passing these cases is not a proof of
all interleavings, durable delivery, production load capacity or universal
accessibility. Coverage percentage is not measured.
