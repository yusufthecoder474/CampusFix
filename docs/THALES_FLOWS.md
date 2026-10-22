# CampusFix request and transaction flows

These diagrams describe `src/api.ts`, `src/requests/workflow.ts`,
`src/realtime.ts` and `web/src/live.tsx`. PostgreSQL is authoritative.

## HTTP action and live refresh

```mermaid
sequenceDiagram
    participant UI as React client
    participant API as Express API
    participant DB as PostgreSQL
    participant Live as Socket.IO
    UI->>API: POST action, expectedVersion, cookie and CSRF
    API->>API: Validate Origin, session, role and input
    API->>DB: Execute workflow transaction
    alt Transaction commits
        DB-->>API: Updated request and version
        API->>Live: Publish compact change hint
        Live->>DB: Reauthenticate and check current access
        Live-->>UI: request:changed for authorized sockets
        API-->>UI: HTTP 200 with updated request
        UI->>API: Refetch affected REST caches
    else Conflict or failure
        DB-->>API: Rollback
        API-->>UI: 409 stale version or safe error response
    end
```

Publishing occurs after the transaction resolves. A delivery error is logged and
does not undo a committed write. No durable outbox or event replay is implemented.
The HTTP response and socket hint need not reach a browser in a fixed order.

## Workflow transaction

```mermaid
flowchart TD
    A["Validate command and role"] --> B["BEGIN READ COMMITTED"]
    B --> C["SELECT request FOR UPDATE"]
    C --> D{"Visible to actor?"}
    D -- No --> R["Rollback and safe error"]
    D -- Yes --> E{"Version matches?"}
    E -- No --> S["Rollback: HTTP 409 STALE_VERSION"]
    E -- Yes --> F["Check transition and technician"]
    F --> G["Conditional UPDATE and increment version"]
    G --> H["INSERT audit event"]
    H --> I["COMMIT and release locks"]
    F -- Invalid --> R
    G -- Failure --> R
    H -- Failure --> R
```

The request row lock lasts until commit or rollback. Assignment also takes a
shared lock on the target technician row while checking its role. A composite
foreign key backs the technician restriction. The request update and audit event
are one atomic unit. A unique request/version audit constraint prevents duplicate
versions. Lists and history use separate repeatable-read, read-only transactions
so their items and total come from one snapshot.

## Controlled concurrency test

Two authenticated coordinators read the same version. A third connection holds
the target request lock while both HTTP actions begin. The test queries
`pg_stat_activity` and `pg_blocking_pids` until it observes two distinct request
backend PIDs waiting on locks, then releases the blocker. One action commits;
the other sees the new version under READ COMMITTED and returns HTTP 409.

The winner is deliberately unspecified. Assertions check its persisted status,
assignee, incremented version and matching audit actor; the loser contributes no
audit row. A separate injected audit-insert failure checks the complete request
row remains unchanged. PGlite skips these native concurrency cases.
