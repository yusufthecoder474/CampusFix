# Final milestone architecture — pre-implementation decision

Keep M4 database schema/services and REST authorization authoritative. No migration 003 is required for ephemeral notifications.

Socket.IO attaches to the existing HTTP server, using WebSocket transport only. Exact Origin, existing HttpOnly session cookie and session-bound CSRF authenticate the handshake. Clients cannot choose rooms. The server assigns no client-controlled rooms and reauthenticates each intended recipient before delivery and periodically while idle. Only reporter, coordinator and assigned technician receive compact requestId/version/action signals. A signal is published after the REST service promise resolves (transaction committed), never from inside the transaction. Failure to deliver cannot roll back a committed write. Missed notifications are recovered by REST refetch on connection; there is no durable/outbox delivery guarantee or multi-process bus.

React Query stores REST server state under stable request/list/history/directory keys. No optimistic assignment updates. Mutation success/conflict and live signals invalidate relevant caches. Session change clears cached private data. Context owns session state; forms use local state. Socket hook owns one connection and listeners per mounted authenticated session, bounded reconnection, version deduplication and cleanup. Notifications are a bounded in-memory list with local mark-read, cleared on logout.

React Router HashRouter retains existing #/ links and static serving. Protected routes are UI behavior, not authorization. Shared layout, filters, pagination, request cards and accessible confirmation dialog reduce repetition. Preserve old named component exports and all prior behavioral assertions; test renders may gain providers.

Measure M4 bundle before adding dependencies; compare total and initial-route asset bytes honestly. New realtime/cache/router functionality may increase size. Use route lazy loading if measured initial download decreases; do not add memoization without a concrete reason. useMemo may stabilize Context values rather than inventing an expensive computation.
