# Component catalogue

| Component/module                         | Responsibility                                                  |
| ---------------------------------------- | --------------------------------------------------------------- |
| App / ProtectedRoute                     | Provider composition, hash routes, session gate                 |
| SessionProvider / useSession             | Authentication boundary and stable shared callbacks             |
| AppLayout / Sidebar                      | Navigation, user account, connection/notification toolbar       |
| NotificationList                         | Bounded received hints, timestamps, local unread behavior       |
| RequestFilters                           | Controlled status/location/page-size form                       |
| RequestCard / Status                     | Request summary and visible textual status                      |
| Pagination                               | Shared request-page boundary controls                           |
| RequestList                              | Scoped query and results/loading/empty/error states             |
| RequestForm                              | Controlled creation fields, trimmed validation, create mutation |
| RequestDetail                            | Authoritative detail, permitted controls and progress refresh   |
| WorkflowControls                         | Explicit coordinator/technician/reporter action forms           |
| RequestHistory                           | Paginated progress timeline                                     |
| ConfirmDialog                            | Native modal, cancellation, autofocus and focus restoration     |
| Alert / Loading / EmptyState / PageTitle | Reusable semantic states and page focus                         |

Each page accepts the typed API boundary for testing while the main app supplies it through session Context. Custom query hooks centralize data lifecycle. Export names from M3/M4 remain compatible with existing test imports. No generic component abstraction attempts to authorize business actions.
