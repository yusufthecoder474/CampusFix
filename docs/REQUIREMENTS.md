# CampusFix — requirements and Heizen alignment

Milestone 4 of 5. A standalone portfolio project, not affiliated with Heizen.
Problem hypothesis: campus maintenance reports lose ownership and visibility in informal channels. Validate with three students and a coordinator before claiming user demand. Synthetic data only.

## Scope

One campus. Students report and view their own requests. Coordinators view, triage and assign requests to technicians. Technicians view available work and their own assigned work. No access to other students' personal data through available-work listings.
Transitions: reported -> available (coordinator), available -> in_progress (coordinator assignment), in_progress -> resolved (assigned technician, resolution note), resolved -> closed or in_progress (reporter confirms or reopens). Closed is terminal in this MVP. Reopening retains the assignee.

## Acceptance rules

Exactly one coordinator assignment may win for an unassigned request/version. All successful changes and history events commit together. Unauthorized users cannot read or change private records. Invalid transitions return 409; forbidden actions 403; inaccessible IDs 404. Listings have bounded pagination. User input cannot assign roles, reporter IDs or history actors. Sessions are opaque random tokens, hashed in storage; cookie and CSRF protection required in milestone 2.

## JD mapping

- TypeScript/Node: strict typed backend and clear business services.
- Frontend/backend: React forms and role-specific read screens (milestone 3).
- REST/SQL: documented endpoints, foreign keys and transactions (milestones 2–4).
- Testing/debugging: policy tests, real database/API integration, error reproduction.
- Basic cloud: deployment, HTTPS, secrets, health checks (milestone 5).
- Ownership: written requirements, issue log and release checklist.
- Code review: request a genuine peer review; no fabricated collaboration.
- OOP/DSA: explain encapsulation and data modeling; prepare coursework separately.

## Milestones

1. Requirements, pure workflow policy, SQL migration, HTTP foundation, tests.
2. Password hashing, sessions, authorization and request creation/listing with real PostgreSQL integration tests.
3. React interfaces for existing APIs and browser tests.
4. Atomic transitions, audit history, race/failure evaluation and corresponding UI.
5. Cloud deployment, reproducibility, real peer review, final evidence report.

M1–M4 are implemented. Native M4 contention and Windows execution remain validation gates when the build environment cannot run PostgreSQL. The M1 claim policy is historical only, not a current API. See WORKFLOW.md for authoritative role rules and VERIFICATION.md for executed checks. M5 deployment and genuine peer review remain future work.

## Final VE3 frontend alignment

Final milestone: reusable React/TypeScript components, controlled forms, React Router, Context/hooks, TanStack Query REST integration, Socket.IO live updates, reconnect handling, responsive CSS, accessibility checks, debugging and measured bundle/cache behavior. The earlier Heizen mapping is historical and the backend remains useful engineering evidence. No employment, collaboration, public deployment or ATS score is inferred from project implementation.
