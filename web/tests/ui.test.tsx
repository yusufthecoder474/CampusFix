import { render } from "./render";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { ApiClient, ApiError, type Session } from "../src/api";
import { Login } from "../src/Login";
import { RequestList, RequestForm, RequestDetail } from "../src/Requests";
import { App } from "../src/App";
const session: Session = {
  user: { id: "s", displayName: "Asha", role: "student" },
  csrfToken: "test-csrf",
};
const item = {
  id: "1",
  version: 0,
  title: "Broken fan",
  description: "Fan will not start",
  location: "Hostel A",
  status: "reported",
  createdAt: "2026-10-12T00:00:00Z",
  updatedAt: "2026-10-12T00:00:00Z",
  resolutionNote: null,
  assigneeId: null,
};
it("login has accessible fields and submits credentials", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "login").mockResolvedValue(session);
  const done = vi.fn();
  render(<Login api={api} onLogin={done} notice="" />);
  await userEvent.type(
    screen.getByLabelText("Email address"),
    "student@campusfix.test",
  );
  await userEvent.type(screen.getByLabelText("Password"), "password");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(api.login).toHaveBeenCalledWith("student@campusfix.test", "password");
  expect(done).toHaveBeenCalledWith(session);
});
it("failed login gives focused readable error", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "login").mockRejectedValue(
    new ApiError(401, "INVALID_CREDENTIALS"),
  );
  render(<Login api={api} onLogin={() => {}} notice="" />);
  fireEvent.submit(
    screen.getByRole("button", { name: "Sign in" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Email or password is incorrect",
  );
  await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
});
it("shows a loading state then an empty result", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "list").mockResolvedValue({
    items: [],
    page: 1,
    limit: 10,
    total: 0,
  });
  render(<RequestList api={api} role="student" />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  expect(await screen.findByText("No requests to show")).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});
it("filters reset pagination and use existing API parameters", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "list").mockResolvedValue({
    items: [item],
    page: 1,
    limit: 10,
    total: 25,
  });
  render(<RequestList api={api} role="student" />);
  await screen.findByText("Broken fan");
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(api.list).toHaveBeenLastCalledWith(
      "page=2&limit=10",
      expect.any(AbortSignal),
    ),
  );
  await userEvent.selectOptions(screen.getByLabelText("Status"), "reported");
  await userEvent.type(screen.getByLabelText("Exact location"), "Hostel A");
  await userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() =>
    expect(api.list).toHaveBeenLastCalledWith(
      "page=1&limit=10&status=reported&location=Hostel+A",
      expect.any(AbortSignal),
    ),
  );
});
it("technician view never offers creation or assignment", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "list").mockResolvedValue({
    items: [item],
    page: 1,
    limit: 10,
    total: 1,
  });
  render(<RequestList api={api} role="technician" />);
  await screen.findByText("Broken fan");
  expect(
    screen.queryByRole("link", { name: /Report an issue/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /assign|claim/i }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Viewing only/)).toBeVisible();
});
it("request creation validates trimmed inputs before submission", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "create");
  render(<RequestForm api={api} />);
  fireEvent.submit(
    screen.getByRole("button", { name: "Submit request" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("at least 5");
  expect(api.create).not.toHaveBeenCalled();
});
it("valid request submission navigates to persisted detail", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "create").mockResolvedValue({ request: item });
  render(<RequestForm api={api} />);
  await userEvent.type(screen.getByLabelText("Issue title"), "Broken fan");
  await userEvent.type(screen.getByLabelText("Location"), "Hostel A");
  await userEvent.type(
    screen.getByLabelText("What needs attention?"),
    "Fan will not start",
  );
  await userEvent.click(screen.getByRole("button", { name: "Submit request" }));
  await waitFor(() => expect(window.location.hash).toBe("#/requests/1"));
});
it("detail handles role-redacted descriptions", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "detail").mockResolvedValue({
    request: { ...item, description: undefined },
  });
  render(<RequestDetail api={api} id="1" />);
  expect(
    await screen.findByText("The description is not shared with your role."),
  ).toBeVisible();
});
it("detail shows inaccessible record error", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "detail").mockRejectedValue(new ApiError(404, "NOT_FOUND"));
  render(<RequestDetail api={api} id="bad" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "not available to your account",
  );
});
it("list failure supports an explicit retry", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "list")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ items: [], page: 1, limit: 10, total: 0 });
  render(<RequestList api={api} role="student" />);
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("button", { name: "Retry loading" }));
  expect(await screen.findByText("No requests to show")).toBeVisible();
});
it("restores cookie session on reload and limits coordinator navigation", async () => {
  vi.spyOn(ApiClient.prototype, "me").mockResolvedValue({
    ...session,
    user: { ...session.user, role: "coordinator" },
  });
  vi.spyOn(ApiClient.prototype, "list").mockResolvedValue({
    items: [],
    page: 1,
    limit: 10,
    total: 0,
  });
  render(<App />);
  expect(
    await screen.findByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Report an issue" }),
  ).not.toBeInTheDocument();
});
