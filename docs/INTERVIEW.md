# Interview explanation for VE3

## Two-minute explanation

“CampusFix lets students report maintenance problems, coordinators assign technicians, and students track the repair to closure. I extended an existing tested Node/PostgreSQL application with a React frontend and live updates. The database remains the authority: two coordinators cannot silently overwrite an assignment because changes use a row lock and the version the user viewed. React Router handles protected hash routes, Context holds the session, and TanStack Query handles fetched data and mutations. Socket.IO sends only authorized change hints after a transaction commits; the client refetches REST data. Reconnection recovers missed state, and notifications are deliberately session-only. I tested role workflows, session expiry, conflicts, rollback, socket security, browser synchronization, responsive layouts and selected accessibility rules. I also documented increased bundle size and measured the effect of lazy workspace loading.”

Use only the test results actually executed on your machine when describing native verification.

## Technical walkthrough and questions

1. Why React? Explain reusable functional components, typed props, controlled forms and composition; identify RequestFilters, RequestCard, Pagination, workflow forms and dialog.
2. Which state belongs where? Context for the session, useState for input/dialog visibility, TanStack Query for REST state. Explain why a query cache is not a general UI store.
3. What do hooks do here? Point to REACT_HOOKS.md; explain effect cleanup and stable expiration callbacks, not just definitions.
4. Why HashRouter? It preserves #/ URLs with the existing static Express server. Protected routes are usability; APIs enforce security.
5. How does the cache avoid cross-account reads? User-scoped keys, clearing/cancelling on session change and guarded create caching. Explain staleTime versus invalidation.
6. How are mutations handled? No optimistic assignment; send expectedVersion, wait for REST, invalidate relevant data. On 409 review fresh state before retrying.
7. REST versus Socket.IO? REST reads/mutates authoritative state; sockets notify about change. Compact hints contain no descriptions/notes.
8. Who receives a live event? Server decides from reporter/current coordinator/current assignee, with cookie/CSRF/Origin handshake and reauthentication. Clients cannot join arbitrary rooms.
9. Why emit after commit? An event inside a transaction could announce a change later rolled back. Publication failure cannot roll back an already committed operation.
10. What happens offline? Bounded reconnect; connect invalidates caches. Current state is recovered, but missing ephemeral notifications are not replayed. Explain why an outbox would be a separate future design.
11. How are duplicates handled? Version tracking ignores repeated/older hints; listener cleanup avoids subscription duplication. Events never overwrite request objects.
12. What bug did testing find? Duplicate keys for action/history siblings left old controls visible when cache data updated in place. Distinct key prefixes plus a regression test fixed it.
13. What did caching change in testing? Applying unchanged filters originally reused cache and skipped the expected session check. Explicit Apply now refetches; navigation still benefits from a fresh cache.
14. What is measured performance? Bundle bytes before/after lazy workspace split and three cached navigation trials. Total size grows from M4; no invented latency/throughput improvement.
15. What do tests not prove? Embedded PostgreSQL cannot prove multi-connection contention. Axe cannot prove complete accessibility. Synthetic socket/browser tests are not production-scale reliability or compliance evidence.

## Five-minute architecture demo

Show a role-specific request and history; locate App/SessionProvider/queries/useLive; show the REST service lock/version/event transaction; show socket audience filtering; run or open exact test evidence; finish with the known limitations. Explain the old pure claim function as historical test-compatible code, not an HTTP endpoint.

## Debugging exercises

- Wrong localhost Origin: compare address and APP_ORIGIN; fix configuration rather than weakening checks.
- Duplicate assignment: inspect request version and 409 reference; refetch before acting.
- Live disconnected: inspect connection indicator and authenticated REST first; reconnect, then verify state. Do not treat a missed toast as lost database data.
- Empty technician list: inspect assigned/available status and authenticated role; do not bypass scope with frontend filters.
- Rate-limit failures in tests: isolate server workloads, preserve production limits, and retain backend 429 assertions.
