export type Role = "student" | "technician" | "coordinator";
export interface Session {
  user: { id: string; displayName: string; role: Role };
  csrfToken: string;
}
export interface MaintenanceRequest {
  id: string;
  version: number;
  title: string;
  description?: string;
  location: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolutionNote: string | null;
  assigneeId: string | null;
  reporterId?: string;
}
export interface TechnicianPage {
  items: { id: string; displayName: string }[];
  page: number;
  limit: number;
  total: number;
}
export interface HistoryPage {
  items: {
    id: number;
    action: string;
    previousStatus: string | null;
    nextStatus: string;
    requestVersion: number | null;
    note: string | null;
    createdAt: string;
    actorRole: string;
  }[];
  page: number;
  limit: number;
  total: number;
}
export interface Page {
  items: MaintenanceRequest[];
  page: number;
  limit: number;
  total: number;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public requestId?: string,
  ) {
    super(code);
  }
}
export function message(error: unknown): string {
  if (!(error instanceof ApiError))
    return "Cannot reach CampusFix. Check your connection and try again.";
  const labels: Record<string, string> = {
    STALE_VERSION:
      "This request changed in another session. The latest progress has been loaded; review it before acting again.",
    INVALID_TRANSITION:
      "This action is no longer valid. Review the latest progress.",
    INVALID_TECHNICIAN: "Select an existing technician.",
    INVALID_CREDENTIALS: "Email or password is incorrect.",
    AUTHENTICATION_REQUIRED: "Your session has expired. Please sign in again.",
    NOT_FOUND:
      "This request was not found or is not available to your account.",
    FORBIDDEN: "Your account cannot perform this action.",
    CSRF_REJECTED:
      "Your session changed. Reload this page before trying again.",
    ORIGIN_REJECTED: "Open CampusFix using the configured application address.",
    VALIDATION_ERROR: "Check the form values and try again.",
    LOGIN_RATE_LIMITED: "Too many sign-in attempts. Please wait 15 minutes.",
    RATE_LIMITED: "Too many requests. Please wait a minute.",
  };
  return (
    (labels[error.code] ??
      "The server could not complete this request. Please try again.") +
    (error.requestId ? ` Reference: ${error.requestId}` : "")
  );
}
export class ApiClient {
  private csrf = "";
  scope = "";
  constructor(private expired: () => void = () => {}) {}
  async call<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch("/api" + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      signal,
      headers:
        body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              ...(this.csrf ? { "X-CSRF-Token": this.csrf } : {}),
            },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204) return undefined as T;
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && path !== "/auth/login") {
        this.csrf = "";
        this.scope = "";
        this.expired();
      }
      throw new ApiError(
        response.status,
        data.error?.code ?? "INTERNAL_ERROR",
        data.error?.requestId,
      );
    }
    return data as T;
  }
  async me(signal?: AbortSignal) {
    const s = await this.call<Session>("/auth/me", undefined, signal);
    this.csrf = s.csrfToken;
    this.scope = s.user.id;
    return s;
  }
  async login(email: string, password: string) {
    const s = await this.call<Session>("/auth/login", { email, password });
    this.csrf = s.csrfToken;
    this.scope = s.user.id;
    return s;
  }
  async logout() {
    await this.call("/auth/logout", {});
    this.csrf = "";
    this.scope = "";
  }
  list(query: string, signal?: AbortSignal) {
    return this.call<Page>("/requests?" + query, undefined, signal);
  }
  detail(id: string, signal?: AbortSignal) {
    return this.call<{ request: MaintenanceRequest }>(
      "/requests/" + encodeURIComponent(id),
      undefined,
      signal,
    );
  }
  act(
    id: string,
    input: {
      action: string;
      expectedVersion: number;
      technicianId?: string;
      note?: string;
    },
  ) {
    return this.call<{ request: MaintenanceRequest }>(
      "/requests/" + encodeURIComponent(id) + "/actions",
      input,
    );
  }
  technicians(page: number, signal?: AbortSignal) {
    return this.call<TechnicianPage>(
      `/technicians?page=${page}&limit=20`,
      undefined,
      signal,
    );
  }
  history(id: string, page: number, signal?: AbortSignal) {
    return this.call<HistoryPage>(
      `/requests/${encodeURIComponent(id)}/events?page=${page}&limit=5`,
      undefined,
      signal,
    );
  }
  create(input: { title: string; description: string; location: string }) {
    return this.call<{ request: MaintenanceRequest }>("/requests", input);
  }
}
