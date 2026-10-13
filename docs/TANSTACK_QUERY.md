# Server-state cache strategy

TanStack Query 5.104.2 stores REST data. Default staleTime is 30 seconds, gcTime five minutes, retry false, refetchOnWindowFocus true. Mutation retries are also disabled because an uncertain write may have committed. The query function consumes AbortSignal.

Keys:

- requests: root, user scope, role, validated filter/page object.
- request: root, request ID, user scope.
- history: root, request ID, user scope, page.
- technicians: root, user scope, page.

A create success caches that new detail under its original user scope only if the API still has that scope, then invalidates lists. Workflow success/409 invalidates the affected detail/history and request lists. The directory is not invalidated for ordinary status changes. There are no optimistic database-state updates. On 409 the UI explains the stale decision and reloads server state before another action.

Socket hints share the same invalidator. Every connection revalidates caches because the client cannot know what was missed. Concurrent hints/mutations can trigger additional reads; correctness takes priority over a claim of zero redundant traffic. Tests record fresh navigation reuse rather than inventing a global request reduction.

Applying unchanged filters explicitly refetches, preserving the user's request to reload data and the session-expiry test. Returning to a fresh list through navigation reuses cached data. Session changes cancel/clear queries; scoped keys prevent one account's cached detail being reused by another.

React Context is session/UI state, local React state is form/dialog state, and this cache is server state. No general state-management store is added. Source/types and runtime tests verify the supported APIs used here. Reference: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation .
