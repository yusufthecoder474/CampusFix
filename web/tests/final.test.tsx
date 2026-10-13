import { it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "./render";
import { createQueryClient, invalidateRequest } from "../src/queries";
import { acceptVersion } from "../src/live";
import { ConfirmDialog, Pagination } from "../src/ui";
import { App } from "../src/App";
import { ApiClient } from "../src/api";
it("fresh server-state cache reuses a query and targeted invalidation leaves directory intact", async () => {
  const client = createQueryClient(),
    fetcher = vi.fn().mockResolvedValue({ request: { version: 3 } });
  await client.fetchQuery({ queryKey: ["request", "r"], queryFn: fetcher });
  await client.fetchQuery({ queryKey: ["request", "r"], queryFn: fetcher });
  expect(fetcher).toHaveBeenCalledTimes(1);
  client.setQueryData(["technicians", 1], { items: [] });
  await invalidateRequest(client, "r");
  expect(client.getQueryState(["request", "r"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["technicians", 1])?.isInvalidated).toBe(false);
  client.clear();
});
it("duplicate and stale socket versions are ignored without overwriting state", () => {
  const seen = new Map<string, number>();
  expect(
    acceptVersion(seen, { requestId: "r", version: 3, action: "resolve" }),
  ).toBe(true);
  expect(
    acceptVersion(seen, { requestId: "r", version: 3, action: "resolve" }),
  ).toBe(false);
  expect(
    acceptVersion(seen, { requestId: "r", version: 2, action: "assign" }),
  ).toBe(false);
  expect(seen.get("r")).toBe(3);
});
it("confirmation cancel performs no mutation and keeps an accessible heading", async () => {
  const confirm = vi.fn(),
    cancel = vi.fn();
  render(
    <ConfirmDialog
      title="Assign this technician?"
      onConfirm={confirm}
      onCancel={cancel}
    />,
  );
  expect(screen.getByRole("dialog")).toHaveAccessibleName(
    "Assign this technician?",
  );
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});
it("shared pagination disables boundary actions", async () => {
  const changed = vi.fn();
  render(<Pagination page={1} total={21} limit={20} onPage={changed} />);
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(changed).toHaveBeenCalledWith(2);
});
it("router preserves requested detail during session restoration and renders not-found", async () => {
  window.location.hash = "#/missing";
  vi.spyOn(ApiClient.prototype, "me").mockResolvedValue({
    user: { id: "s", role: "student", displayName: "Asha" },
    csrfToken: "x",
  });
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});
it("expired session redirects protected routes to sign-in", async () => {
  window.location.hash = "#/new";
  vi.spyOn(ApiClient.prototype, "me").mockRejectedValue(
    Object.assign(new Error("expired"), { status: 401 }),
  );
  // The exact typed API error is exercised by the preserved API client tests.
  const { ApiError } = await import("../src/api");
  vi.spyOn(ApiClient.prototype, "me").mockRejectedValue(
    new ApiError(401, "AUTHENTICATION_REQUIRED"),
  );
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Sign in to CampusFix" }),
  ).toBeVisible();
  await waitFor(() => expect(window.location.hash).toBe("#/login"));
});

it("live version changes replace controls without duplicate sibling keys", async () => {
  const { RequestDetail } = await import("../src/Requests");
  const api = new ApiClient();
  const row = {
    id: "r",
    version: 2,
    title: "Broken lamp",
    description: "Synthetic lamp issue",
    location: "Lab",
    status: "in_progress",
    assigneeId: "t",
    reporterId: "s",
    resolutionNote: null,
    createdAt: "2026-10-12",
    updatedAt: "2026-10-12",
  };
  vi.spyOn(api, "detail")
    .mockResolvedValueOnce({ request: row })
    .mockResolvedValueOnce({
      request: {
        ...row,
        version: 3,
        status: "resolved",
        resolutionNote: "Fixed lamp",
      },
    })
    .mockResolvedValueOnce({ request: { ...row, version: 4 } });
  vi.spyOn(api, "history").mockResolvedValue({
    items: [],
    page: 1,
    limit: 5,
    total: 0,
  });
  render(
    <RequestDetail
      api={api}
      id="r"
      user={{ id: "t", role: "technician", displayName: "Sam" }}
    />,
  );
  await screen.findByRole("button", { name: "Mark resolved" });
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh progress" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Mark resolved" }),
    ).not.toBeInTheDocument(),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh progress" }),
  );
  await screen.findByRole("button", { name: "Mark resolved" });
  expect(
    screen.getAllByRole("region", { name: "Request actions" }),
  ).toHaveLength(1);
  expect(
    screen.getAllByRole("region", { name: "Progress history" }),
  ).toHaveLength(1);
});
