# Frontend architecture

`App.tsx` composes QueryClientProvider, SessionProvider and HashRouter. Public login and protected layout routes preserve session restoration. `/`, `/new` and `/requests/:id` remain compatible with old hash links. `/student`, `/coordinator` and `/technician` are dashboard aliases; the actual account role determines the scoped content. These aliases grant no additional privileges. Unknown routes display a not-found screen.

`Layout.tsx` contains AppLayout, Sidebar and NotificationList. Sidebar reads shared session Context rather than accepting several nested props. The layout owns one socket hook for its authenticated lifetime; changing routes does not add subscriptions. It shows connection state, a bounded notification list and local unread count.

`Requests.tsx` composes controlled RequestFilters, RequestCard, Pagination, EmptyState, form and detail views. `Workflow.tsx` composes role action forms, ConfirmDialog and progress history. Assignment/closure are confirmed; resolution/reopening require operational notes. Detail and history use different React key prefixes: a regression test verifies that live version changes cannot leave duplicate controls.

`queries.ts` centralizes useRequests, useRequestDetails, useRequestHistory, useTechnicians, useCreateRequest and useWorkflowMutation. API contracts are in api.ts. Query hooks pass AbortSignal to fetch. There is no parallel manual fetch implementation for these screens. Authentication restoration remains an effect because it initializes the Context/CSRF boundary.

Status, page headings, alerts/loading states, cards, filters, pagination, dialog, sidebar and notifications are reusable components. The role action component remains explicit rather than introducing a generic workflow renderer that would obscure business permissions.

Requests screens are lazily loaded as one route chunk. This is intentionally modest splitting for a small application. No Redux, Zustand, Next.js, extra CSS framework or speculative React.memo optimization is introduced. Viewports are handled by CSS Grid/Flexbox/media queries. Backend code and migrations are preserved; the final milestone adds an optional notification publisher around committed REST operations.
