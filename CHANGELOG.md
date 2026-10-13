# Final milestone — 2026-10-12

- Added authenticated Socket.IO after-commit notifications, recipient reauthentication, compact payloads, listener cleanup, bounded reconnect, version deduplication and REST recovery.
- Added React Router HashRouter/protected screens, session Context and TanStack Query scoped caching/mutations/invalidation. Preserved M4 API/workflow/database contracts and immutable migrations.
- Added reusable sidebar, cards, controlled filters, pagination, states and native confirmation dialog; preserved CampusFix visual identity.
- Added eight actual socket checks, eight additional React cases, four-context live/reconnect browser journey, four responsive/axe cases and a cache-navigation measurement.
- Fixed duplicate sibling keys exposed by live cache updates and unchanged-filter behavior exposed by session-expiry tests. Browser suites use isolated servers instead of weakening existing rate limits.
- Lazy authenticated Layout/socket chunk reduced M5 initial entry by 45,555 raw bytes compared with the measured pre-split M5 build; total bundle remains larger than M4.
- Added requested portfolio/architecture/React/security/accessibility/performance/testing documentation, synthetic screenshots and verified-versus-unverified evidence.
- No database migration 003, environment overwrite, volume operation, external publishing or fabricated native result.

# Milestone 4 — 2026-10-12

- Added coordinator triage/assignment, assigned-technician resolution, reporter reopen/close, paginated technician directory and scoped progress history.
- Added service-side role/object checks, row locks, expected-version conflict detection and transactional state/history updates. No technician self-assignment API.
- Added migration 002: version, technician composite FK, event version uniqueness and event shape checks. Original migration 001 unchanged. Migrator processes ordered checksummed files in one transaction with bounded lock wait; incompatible legacy data fails without deletion.
- Added React action forms, progress/history pagination, technician selection and conflict refresh. Preserved M3 same-origin cookies, CSRF and redaction.
- Added migration/authorization/rollback/constraint tests, two native-only two-coordinator contention cases (three repetitions each), component tests and a four-step multi-role browser lifecycle.
- Original M1 policy/tests remain; historical technician claim function is intentionally not an HTTP operation. M2 integration setup now first applies 001 when constructing its legacy adoption fixture; test assertions remain.
- Native test runner now runs both database suites and writes result/concurrency evidence. Native E2E pool supports multiple connections. Doctor checks M4 fields.
- Environment/credentials/Compose definitions unchanged. Windows instructions explain same-volume reuse from a new extracted folder.

# Milestone 3 — 2026-10-12

- Added React/TypeScript frontend for existing auth and request APIs; student creation/list/detail/filter/pagination; coordinator/technician read views.
- Added same-origin static hosting and local HTTP-compatible CSP (production retains upgrade-insecure-requests), in-memory CSRF, session restore/logout and error handling.
- Added 13 component/client tests and 6 Chromium E2E scenarios, isolated embedded/native browser database runners, lint and frontend build scripts.
- Changed integration pool initialization from an unawaited connect event query to awaited `onConnect`. This prevents overlap with the first borrowed-client query. The reported query concurrency warning was not reproduced here; no test expectations were changed.
- Preserved database schema/migration, backend business services, auth rules, original test assertions, Compose settings and environment files. No new assignment/transition endpoint.
- Added Windows M2-to-M3 upgrade steps, frontend documentation, raw evidence and CI configuration for frontend/browser checks.
- TypeScript 7 is retained. ESLint 10 uses Babel's supported TypeScript parser because the inspected typescript-eslint release excluded TypeScript 7. Type checking is a separate required gate.

## Earlier history (preserved)

# Milestone 2 changelog

Continued existing M1 repository; original tests, src/domain/workflow.ts and db/001_initial.sql preserved.

Inspection findings: M1 had no Drizzle dependency, only pg; no authentication/request routes; migration refused existing databases; fixed host port 5432; no shared configuration module. Added stable pinned Drizzle over pg rather than rebuilding the schema. Kept the initial SQL authoritative.

Added auth and request services, typed table mappings, API router, strict config, secure sessions/CSRF/origin validation, role-scoped reads, pagination, transactional request history, rate limits and safe logging. Existing createApp(checkDatabase) tests remain compatible; runtime supplies optional database/config services.

Added setup, seed, diagnostics, separate test-database helper, migration checksums and verified legacy adoption. Migrations use a transaction/advisory lock; no application tables or rows are dropped. Default database host port changed to configurable 55432; M1 users can retain 5432. Existing volume name and Compose project naming behavior preserved.

Added embedded integration suite and explicit native mode, GitHub Actions PostgreSQL service configuration, Windows guide and API/security docs. No remote CI execution or cloud deployment claimed. M3 transition/concurrency APIs and M4 React remain excluded.

Testing found installed cookie exports parseCookie, not parse; Drizzle transaction configuration uses accessMode. Adjusted to installed typed APIs. PGlite wire adapter terminated a connection after a constraint error; embedded constraint assertions now use the direct engine API, while native mode retains pg. Connection startup search_path was not honored by the embedded adapter, so test connections explicitly set their isolated schema. Neither workaround changes application production code.
