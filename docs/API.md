# CampusFix API — Milestone 4

Same-origin JSON REST API. Cookie session and exact APP_ORIGIN are unchanged. Every authenticated POST requires X-CSRF-Token from login/me; browser Origin is automatic. Cookies are HttpOnly/SameSite Strict, Secure in production. No bearer/localStorage token scheme or permissive CORS.

| Method/path                    | Purpose                                               | Permission                               |
| ------------------------------ | ----------------------------------------------------- | ---------------------------------------- |
| POST /api/auth/login           | {email,password}; returns {user,csrfToken} and cookie | Existing account; exact Origin           |
| GET /api/auth/me               | Current principal and CSRF token                      | Signed in                                |
| POST /api/auth/logout          | Empty JSON object; 204                                | Signed in + CSRF                         |
| POST /api/requests             | {title,description,location}; 201 {request}           | Student + CSRF                           |
| GET /api/requests              | Scoped/filterable paginated list                      | Signed in                                |
| GET /api/requests/:id          | {request}                                             | Scoped record                            |
| GET /api/technicians           | Paginated {id,displayName} directory                  | Coordinator only                         |
| POST /api/requests/:id/actions | Versioned command; 200 {request}                      | Action-specific + CSRF                   |
| GET /api/requests/:id/events   | Paginated progress history                            | Reporter/coordinator/assigned technician |

No claim, arbitrary PATCH status, reassignment, user-role editing or account-registration endpoint exists.

## Commands

All bodies are strict: unknown fields rejected. expectedVersion is a required integer 0–2147483646. Request responses now include version. Never invent a version: use the one returned by detail/list/create.

```json
{"action":"triage","expectedVersion":0}
{"action":"assign","expectedVersion":1,"technicianId":"<existing technician UUID>"}
{"action":"resolve","expectedVersion":2,"note":"Replaced the switch."}
{"action":"reopen","expectedVersion":3,"note":"Fault returned after use."}
{"action":"close","expectedVersion":5}
```

The examples illustrate different commands, not one JSON document. Closing may follow first resolution at version 3, or a later resolution; the viewed version is authoritative. Resolve/reopen notes trim to 1–2,000 characters. Assign accepts only a real technician ID. See WORKFLOW.md for exact role/state rules. All successful changes increment version and write an event atomically. 409 STALE_VERSION or INVALID_TRANSITION causes no state/event change. No automatic replay of successful responses or idempotency key is implemented; duplicate commands fail with 409.

## Pagination, scope and history

Lists, technicians and history accept page (1–10000, default 1), limit (1–50, default 20). Request lists additionally accept status (reported/available/in_progress/resolved/closed) and exact location (2–120 trimmed characters). Responses: {items,page,limit,total}. Totals/items use a repeatable-read snapshot. Request sort: createdAt descending, UUID descending. Technician sort: displayName, UUID ascending. History sort: event ID descending. Offset pages can shift when new records/events arrive.

Students read only their own requests; coordinator reads all; technician reads available work or own-assigned requests. Technician detail/list still omit reporterId and description. Available-but-unassigned technicians cannot read history. History returns id, action, previousStatus, nextStatus, requestVersion, note, createdAt and actorRole, never actor credentials/contact information. Legacy requestVersion is null, not fabricated. actorRole is joined from the current user row; this is not a historical identity archive. There is no audit-edit/delete API.

Creation validation remains title 5–120, description 10–2000, location 2–120, trimmed. Server sets reporter/status/version/timestamps. `create` event uses version 0. Existing historical seed events may have null version.

## Errors and limits

Error shape: {"error":{"code":"STALE_VERSION","requestId":"..."}}; X-Request-Id matches. No SQL/secret values are returned.

- 400: VALIDATION_ERROR, INVALID_JSON, INVALID_TECHNICIAN.
- 401: INVALID_CREDENTIALS, AUTHENTICATION_REQUIRED.
- 403: FORBIDDEN, ORIGIN_REJECTED, CSRF_REJECTED. Wrong-role command rejected before object lookup.
- 404: NOT_FOUND, including inaccessible private objects.
- 409: STALE_VERSION, INVALID_TRANSITION.
- 413 PAYLOAD_TOO_LARGE; 415 JSON_REQUIRED; 429 LOGIN_RATE_LIMITED/RATE_LIMITED; 500 INTERNAL_ERROR; readiness 503 DATABASE_UNAVAILABLE.

API 120 requests/minute/IP; login 10/15 minutes/IP; single-process in-memory limits. Session lifetime 1–24 hours (default 8), no sliding refresh. Migration/locking failures are not public database diagnostics. Keep users from placing personal details in operational titles/locations/notes.

## Final live transport

Existing REST contracts, cookie/CSRF/Origin rules and workflow permissions remain unchanged. POST creation/actions publish optional compact notifications only after the service commits. Publication failure is safely logged while preserving the successful REST response. Socket.IO is a separate WebSocket notification channel, not a new workflow command API. See REALTIME_ARCHITECTURE.md. No new SQL migration is required.
