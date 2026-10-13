# Socket.IO transport and recovery

Socket.IO 4.8.4 uses WebSocket transport on the existing HTTP server. This is a read-notification channel; all writes remain authenticated REST commands.

Handshake: exact APP_ORIGIN → existing opaque cookie lookup → session authentication → session-bound HMAC CSRF comparison. Unauthorized connections fail. No client room-selection API exists; attempted subscribe requests receive FORBIDDEN. Intended recipients are computed on the server from committed request ownership and current role. Each recipient is reauthenticated before an event. Idle connections are checked every 30 seconds. Revoked sessions receive session:expired and are disconnected; transient database failure closes the live channel and requires recovery. The transport limits individual packet size to 2,048 bytes. It has no distributed connection-abuse limiter; deployment would need additional operational controls.

The REST router awaits the existing transactional service. Only after that promise resolves does it call publish. A rollback never calls publish. A transport error is safely logged and the successful REST result remains successful. Events carry only {requestId,version,action}; no personal record fields. The server does not broadcast private identifiers to all users.

The client socket hook owns one connection per authenticated layout. It has six reconnection attempts, 500 ms initial delay and a five-second maximum with jitter. Status shows Connecting/Live/Offline/Reconnecting; a manual reconnect button is available after failure. Named socket/manager listeners are removed and the transport disconnected on unmount/logout. Version tracking discards duplicate/older hints and is bounded to 200 request IDs. Hints never overwrite cached request fields.

Connect/reconnect invalidates scoped list/detail/history caches, recovering missed state from REST. A request change invalidates that request's detail/history and visible request lists. Unrelated technician available-work views may remain cached until focus/manual refresh because private assignment identifiers are not sent to them after access ends; the backend still returns 404 for inaccessible detail. This is an explicit privacy/freshness trade-off.

Notifications retain the newest 30 received hints in memory. Mark-read is local UI state; timestamps are client receipt time, not event commit time. Reload/logout loses notification history. No durable delivery, push notification, offline queue, outbox replay, multi-process adapter or production-scale guarantee is claimed.

Verification: eight actual Socket.IO integration checks, plus four independent authenticated browser contexts receiving live creation/assignment/resolution/closure and reconnecting after a missed reopen. React listener tests use a mock only to verify cleanup and deduplication; they are not transport proof.

Official reference checked 2026-10-12: https://socket.io/docs/v4/middlewares/ (middleware runs once per connection, so CampusFix adds publication/idle reauthentication).
