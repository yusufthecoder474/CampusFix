# Durable workflow architecture

## Components and trust boundary

```mermaid
flowchart TB
  UI["React reviewer interface"] --> API["Express permissions and validation"]
  API --> DB[("PostgreSQL requests and audit")]
  DB --> O[("Transactional outbox")]
  W["Node delivery worker"] --> O
  W --> A["Mock Desk A"]
  W --> B["Mock Desk B"]
  W --> R[("Normalized receipts")]
  classDef app fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef data fill:#ccfbf1,stroke:#0f766e,color:#134e4a
  classDef mock fill:#fef3c7,stroke:#b45309,color:#78350f
  class UI,API,W app
  class DB,O,R data
  class A,B mock
```

Providers receive only request UUID, action and version. They never receive passwords, session tokens, reporter IDs, descriptions or review notes. URLs are fixed by operator configuration; application users cannot select a destination. Only HTTPS or loopback HTTP is accepted. Redirects are refused. Configuration is trusted; this is not a general SSRF proxy or an enterprise egress-control system.

## Data model

```mermaid
erDiagram
  USERS ||--o{ MAINTENANCE_REQUESTS : reports
  MAINTENANCE_REQUESTS ||--o{ REQUEST_EVENTS : records
  REQUEST_EVENTS ||--o| WORKFLOW_OUTBOX : enqueues
  WORKFLOW_OUTBOX ||--o| PROVIDER_RECEIPTS : acknowledges
  WORKFLOW_OUTBOX {
    bigint id PK
    uuid request_id FK
    jsonb payload
    text status
    int attempts
    uuid lease_token
    timestamp lease_until
    timestamp available_at
  }
  PROVIDER_RECEIPTS {
    bigint event_id PK
    text provider
    text reference
  }
```

Old audit records do not receive backfilled outbox rows. New inserts are enqueued by the trigger. Audit history is append-only by application convention; a database owner can edit or remove it. No tamper-proof ledger or cryptographic audit integrity is claimed.

## Delivery sequence

```mermaid
sequenceDiagram
  participant API as Workflow API
  participant DB as PostgreSQL
  participant W as Worker
  participant P as Mock provider
  API->>DB: Request change plus audit insert
  Note over DB: Trigger inserts outbox in same transaction
  DB-->>API: Commit
  W->>DB: Claim due event and commit lease
  W->>P: POST minimal payload with stable key
  P-->>W: Accepted reference or classified failure
  W->>DB: Fence lease and save receipt plus delivery state
  Note over W,DB: Ack failure leaves lease recoverable
```

No database transaction remains open during HTTP. A worker crash after acceptance and before acknowledgement can cause another request; local uniqueness does not remove this external ambiguity.

## Delivery states

```mermaid
stateDiagram-v2
  [*] --> pending: New audit insertion
  pending --> processing: Due event claimed
  processing --> delivered: Accepted and receipt committed
  processing --> pending: Transient failure with budget remaining
  processing --> processing: Expired lease claimed with a new token
  processing --> dead: Permanent failure or exhausted budget
```

`dead` and `delivered` are terminal for the automatic worker. Worker attempt count is persisted at claim time, so repeated crashes cannot reset the configured budget. A stale claimant's result cannot overwrite the current lease.

## Module dependencies

```mermaid
flowchart TB
  RUN["run.mjs poll loop"] --> WORK["worker.mjs attempt lifecycle"]
  WORK --> POLICY["policy.mjs classification and backoff"]
  RUN --> STORE["store.mjs PostgreSQL persistence"]
  RUN --> PROVIDER["providers.mjs contract adapters"]
  WORK -. "Injected store and delivery function" .-> STORE
  PROVIDER --> POLICY
```

The worker receives its persistence and delivery functions as dependencies. Local tests exercise its decisions without pretending an in-memory store establishes database correctness. Native integration tests exercise the actual SQL separately.
