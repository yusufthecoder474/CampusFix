# HTTP, Socket.IO and reconnect behavior

## HTTP request-response

The React API client sends JSON over REST. Express parses at most 16 KB and
validates strict Zod command schemas. Session cookies identify the actor; write
requests require the exact configured Origin and a CSRF token. Authorization is
enforced in backend services, regardless of what controls the UI displays.
Drizzle and explicit SQL queries bind data parameters. Test schema identifiers
are generated UUID-based names, rather than user input.

Successful creation returns 201; successful actions return 200. Invalid input is
400, missing authentication 401, forbidden roles 403, concealed or absent records
404, stale versions or invalid transitions 409, large bodies 413 and rate limits 429. Unexpected failures return a generic 500 code and request ID, without SQL,
credentials or stack traces in the response. Internal diagnostics stay in logs.

## Connection setup and access

Both `src/realtime.ts` and `web/src/live.tsx` explicitly configure
`transports: ["websocket"]`. The Socket.IO client opens an Engine.IO WebSocket
connection and then authenticates its Socket.IO namespace. There is no HTTP
long-polling transport or polling-to-WebSocket upgrade in this implementation.
Socket.IO messages use its own protocol over WebSocket; a plain WebSocket client
is not a drop-in Socket.IO client.

The server rejects a connection unless its Origin exactly matches APP_ORIGIN.
It authenticates the session cookie against the database and checks the handshake
CSRF token using a constant-time comparison. Each accepted socket has the normal
implicit Socket.IO room named after its own socket ID. There are no role rooms,
request rooms or authorized client room-selection API. The `subscribe` handler
always acknowledges FORBIDDEN and never joins a room.

For every publication, the server fetches the committed request and rechecks each
socket's session and current role. Coordinators, the reporter and the assigned
technician receive `{requestId, version, action}`; unrelated users do not. A
30-second timer also checks sessions. Logout, revoked sessions and changed roles
cause `session:expired` and disconnection. Database authentication failures cause
`live:unavailable` and disconnection. This is one-process delivery, with no shared
adapter or cross-process broadcast guarantee.

## Disconnect, retry and reconciliation

The hook shows Offline after disconnect. Transport failures permit up to six
automatic attempts, starting at 500 ms, capped at 5 seconds, with jitter and a
5-second connection timeout. Retry exhaustion offers manual reconnect. A server
authentication rejection does not grant a new session; the user must sign in
again. Hook cleanup removes listeners and disconnects the old socket.

Every successful connect, including reconnect, invalidates the `requests`,
`request` and `history` TanStack Query cache families. Active queries refetch via
the authorized REST API. Change hints also invalidate relevant REST state.
Consequently, a client that missed an update while offline can recover current
state without receiving that missed hint. Inactive queries refetch when used.

Notifications are bounded to 30 in-memory entries. Version filtering ignores
duplicate or older hints while a hook is active. This is a UI convenience, not
exactly-once delivery. There is no persisted notification log, acknowledgement
queue, event replay, outbox or durable delivery guarantee. Reconnect recovers
database state, not missed notification history. A failed transaction emits no
success hint; a successful commit whose publication fails remains committed.

## Focused verification

The workflow API suite uses real Socket.IO clients for accepted/rejected
handshakes, forbidden subscriptions, recipient filtering, session revocation,
role changes, WebSocket-only transport and rollback without success events.
Test-only ordered socket markers replace quiet-time sleeps in the focused
negative-delivery assertions. The React test checks cache invalidation on every
connect. Native browser tests disconnect a student context, make a change through
another context and verify current state after reconnect without manual refresh.
These tests do not establish behavior under every proxy, TLS deployment,
multi-server topology, network partition or sustained production load.

References: [Socket.IO client options](https://socket.io/docs/v4/client-options/),
[how Socket.IO works](https://socket.io/docs/v4/how-it-works/),
[PostgreSQL transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html).
