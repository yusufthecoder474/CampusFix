# Threat model — M4

Assets: credential hashes, sessions, private reports and consistent creation history. Actors: students, coordinator, technicians, unauthenticated clients. Single campus; no multi-tenant claim.

- Password disclosure: Node crypto scrypt N=131072,r=8,p=1, random 16-byte salt, 64-byte result; constant-time comparison. Native implementation avoids extra password-library installation. Password input capped at 128 characters; seed minimum 16. Algorithm parameters are fixed in code; migration needed if changed.
- Session theft/fixation: cryptographically random 32-byte opaque token, SHA-256 hash in database, HttpOnly cookie; Secure and __Host- in production. Login replaces the presented prior session only; other devices remain signed in. Absolute expiry; logout deletes session.
- Login enumeration: unknown emails use a dummy password hash and the same generic credential error. Rate limits reduce guessing; they are not distributed abuse protection.
- CSRF: exact Origin validation on all writes including login; JSON-only writes; authenticated writes verify session-bound HMAC CSRF token using constant-time comparison. SameSite is additional protection. No permissive CORS or trusted proxy.
- Broken authorization: server chooses reporter, role comes from database every request, scoped list/detail SQL, 404 for inaccessible IDs. Student cannot create as another user or coordinator. Technician response redacts reporter ID and description; titles/locations must contain no personal details.
- SQL injection/mass assignment: Drizzle parameterized values and strict Zod schemas; no caller-controlled SQL identifiers. Migration/test identifiers are internally generated and validated.
- Partial history: request plus event use one database transaction. Failure-injection test checks rollback.
- Logging/XSS: no cookies, authorization headers, request bodies, credential URLs or passwords in application logs. Helmet headers. React renders text, not injected HTML; component tests verify note text escaping.
- Secrets: generated local .env ignored; no real credentials packaged. Demo seed prohibited in production.
- Dependencies: exact package pins + lockfile, audit command; no claim all vulnerabilities are absent.

Limitations: no MFA, recovery flow, account lifecycle, distributed rate limiter, tamper-proof history, row-level security, cloud TLS verification or external security review. Database owner remains a powerful local-development account. Before deployment use a least-privilege runtime account (select/insert users as needed, select/insert/delete sessions, select/insert/update requests and select/insert events), separate migration credentials, trusted HTTPS termination and reviewed proxy settings. Expired sessions are rejected but not automatically purged in M2. No real student data or production deployment is authorized by this build.

References checked 2026-10-11: OWASP Password Storage Cheat Sheet (scrypt guidance); OWASP CSRF Prevention Cheat Sheet; Drizzle PostgreSQL/node-postgres documentation. Research motivation remains docs/EVALUATION.md; no novelty claim.

## M3 browser controls and limitations

The UI is served by Express at the API origin. Fetch uses same-origin cookies; CSRF is in memory and derived/refreshed by existing auth endpoints. JavaScript does not set Origin. The UI does not expose or persist session cookies and does not log credentials. Existing backend authorization remains mandatory even if navigation is bypassed. React renders request content as text. Static HTML is no-cache; fingerprinted assets are immutable. Local HTTP disables CSP upgrade-insecure-requests only outside production; production HTTPS requirements remain unchanged.

Do not use real personal maintenance data in this portfolio demo. UI tests do not prove absence of vulnerabilities or accessibility compliance. In-memory rate limits remain single-process; logout failures can leave a session active and are shown rather than falsely reporting success. Write retries are manual because M2 creation is not idempotent. Browser database tests use isolated synthetic schemas; test cleanup never deletes application tables or Docker volumes.

## M4 workflow threats

- Privilege escalation: command roles checked in WorkflowService before record lookup; ownership/assignee checked again after locking. No arbitrary status endpoint. Directory is coordinator-only and exposes only technician ID/name.
- Conflicting assignments and duplicate transitions: SELECT FOR UPDATE serializes changes to one request; expectedVersion rejects stale decisions, including old resolve commands after reopening. Conditional UPDATE is a second guard. Update/event insertion commit together; injected event failure rolls back the version, status and assignee.
- Invalid assignee role: service lookup plus database composite FK to users(id,role) with fixed assignee_role=technician. Changing an assigned user's role directly conflicts with that FK.
- Audit consistency: unique request/event version and transition-shape checks. Legacy null versions are retained honestly. Application offers no event edit/delete. Database owner can alter data; no tamper-proof, cryptographic or regulatory claim. Runtime least privilege must include UPDATE requests and identity-sequence access for event insertion, not UPDATE/DELETE events.
- Data leakage: available technicians see existing M3 redacted fields but cannot read private history; only reporter/coordinator/assigned technician see notes. Notes are untrusted text, never HTML. User roles in history reflect current user table roles, not a historical role snapshot.
- Cross-origin writes: unchanged exact Origin, JSON body and session-bound CSRF middleware covers all action routes. Role controls in React are convenience only.
- Availability: version conflicts do not retry automatically. Migration lock/statement timeouts avoid waiting indefinitely. Request lock contention can still return a generic server error when the existing pool timeout is exceeded; refresh before retrying. Rate limits remain per-process.

Native concurrency behavior is only verified when the native-only tests actually run; embedded single-connection success cannot substantiate that claim. See VERIFICATION.md for the execution boundary.

## Final Socket.IO and cache boundary

Handshake rejects missing/invalid sessions, wrong exact Origin and incorrect session-bound CSRF. Clients cannot select rooms. Before private delivery and every 30 seconds while idle, the server reauthenticates the socket session. Reporter/coordinator/assigned technician are the only private recipients. Packets are limited to 2,048 bytes; no distributed connection-abuse defense is claimed. Events carry identifiers/version/action only, never notes or descriptions. Revoked connections cannot receive private updates after reauthentication.

Queries include user scope and are cleared/cancelled at session changes. Create caching is guarded against a changed scope. React renders notifications/notes as text. REST remains the only mutation channel and retains M4 row-lock/version/audit rules. No new role permissions or arbitrary subscription API is introduced.

No durable delivery/outbox, multi-process bus, full security audit, cloud TLS execution or production credentials are included. The existing REST rate limits are preserved; browser suites use isolated servers to avoid test workloads exhausting shared limits.
