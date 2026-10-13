# M4 design decision — written before implementation

The coordinator owns assignment. The M1 pure `claim` function stays unchanged for compatibility with its existing tests, but no HTTP claim endpoint exists. New service policy is authoritative.

| Action  | Actor               | From → to               | Extra rule                                                   |
| ------- | ------------------- | ----------------------- | ------------------------------------------------------------ |
| triage  | Coordinator         | reported → available    | Unassigned                                                   |
| assign  | Coordinator         | available → in_progress | Existing technician, previously unassigned                   |
| resolve | Assigned technician | in_progress → resolved  | Nonblank resolution note, max 2,000 characters               |
| reopen  | Reporting student   | resolved → in_progress  | Nonblank reason, retains assignee, clears current resolution |
| close   | Reporting student   | resolved → closed       | Terminal                                                     |

Every mutation requires expectedVersion (nonnegative integer). Lock the request row with SELECT FOR UPDATE, check role/object permission, compare version, validate transition, update exactly once, increment version and insert one event in the SAME transaction. Failed event insertion rolls back request changes. Stale versions or invalid states return 409; forbidden role 403; inaccessible objects 404. Unknown body fields are rejected. No reassignment, unassignment, cancellation or technician self-claim in this milestone.

Assignment checks the user role in the service; a composite foreign key also guarantees every nonnull assignee is a technician. Existing status/assignee and resolution constraints stay intact. Add event version uniqueness (request_id, request_version); historical events keep null version because their ordering must not be invented. Existing request rows start at version 0. Migration fails atomically on incompatible existing data rather than deleting or silently repairing it.

GET history is paginated and ordered by event ID. Reporter and coordinator can read history; assigned technician can read history. Available-but-unassigned technicians retain M3 redacted read access without private history. Responses expose actor role, not student identity or credentials. Current descriptions remain redacted for all technicians as in M3. New notes are visible to the reporter/coordinator/assigned technician; use synthetic operational content.

React uses the current session role and request state to present actions, sends the viewed version, and refreshes detail/history after success or conflict. It never retries writes automatically. Backend checks apply even if UI controls are bypassed. Existing exact Origin/cookie/CSRF middleware wraps every new route.

Native concurrency tests must use multiple pg connections and two distinct coordinator identities. Hold a row lock in a separate transaction, start two HTTP requests, observe both waiting in pg_stat_activity, then release the lock. Assert one 200, one 409, one version increment and one matching audit event. Embedded PGlite is not accepted as concurrency evidence; native-only tests are explicitly skipped there.
