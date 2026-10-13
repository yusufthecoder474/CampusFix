import { render } from "./render";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { WorkflowControls, RequestHistory } from "../src/Workflow";
import {
  ApiClient,
  ApiError,
  type MaintenanceRequest,
  type Session,
} from "../src/api";
const item: MaintenanceRequest = {
  id: "r",
  version: 1,
  title: "Broken fan",
  location: "Hostel",
  description: "Fan does not work",
  status: "available",
  assigneeId: null,
  reporterId: "s",
  resolutionNote: null,
  createdAt: "2026-10-12",
  updatedAt: "2026-10-12",
};
const coordinator: Session["user"] = {
  id: "c",
  role: "coordinator",
  displayName: "Coordinator",
};
const student: Session["user"] = {
  id: "s",
  role: "student",
  displayName: "Student",
};
const technician: Session["user"] = {
  id: "t",
  role: "technician",
  displayName: "Technician",
};
it("coordinator triages a reported request using its viewed version", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "act").mockResolvedValue({ request: item });
  const changed = vi.fn();
  render(
    <WorkflowControls
      api={api}
      item={{ ...item, status: "reported", version: 0 }}
      user={coordinator}
      onChanged={changed}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Triage request" }));
  expect(api.act).toHaveBeenCalledWith("r", {
    action: "triage",
    expectedVersion: 0,
  });
  expect(changed).toHaveBeenCalled();
});
it("coordinator selects a technician and submits an assignment", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "technicians").mockResolvedValue({
    items: [{ id: "t", displayName: "Sam" }],
    page: 1,
    limit: 20,
    total: 1,
  });
  vi.spyOn(api, "act").mockResolvedValue({
    request: { ...item, version: 2, status: "in_progress", assigneeId: "t" },
  });
  render(
    <WorkflowControls
      api={api}
      item={item}
      user={coordinator}
      onChanged={() => {}}
    />,
  );
  await screen.findByLabelText("Assign technician");
  expect(screen.getByRole("button", { name: "Assign request" })).toBeDisabled();
  await userEvent.selectOptions(
    screen.getByLabelText("Assign technician"),
    "t",
  );
  await userEvent.click(screen.getByRole("button", { name: "Assign request" }));
  await userEvent.click(screen.getByRole("button", { name: "Confirm change" }));
  expect(api.act).toHaveBeenCalledWith("r", {
    action: "assign",
    expectedVersion: 1,
    technicianId: "t",
  });
});
it("assignment conflicts refresh instead of retrying a write", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "act").mockRejectedValue(new ApiError(409, "STALE_VERSION"));
  const changed = vi.fn();
  render(
    <WorkflowControls
      api={api}
      item={{ ...item, status: "reported" }}
      user={coordinator}
      onChanged={changed}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Triage request" }));
  await waitFor(() =>
    expect(changed).toHaveBeenCalledWith(
      expect.stringContaining("another session"),
    ),
  );
  expect(api.act).toHaveBeenCalledTimes(1);
});
it("only assigned technician sees resolution action and trims the note", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "act").mockResolvedValue({
    request: { ...item, status: "resolved" },
  });
  const { rerender } = render(
    <WorkflowControls
      api={api}
      item={{ ...item, status: "in_progress", assigneeId: "other" }}
      user={technician}
      onChanged={() => {}}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Mark resolved" }),
  ).not.toBeInTheDocument();
  rerender(
    <WorkflowControls
      api={api}
      item={{ ...item, status: "in_progress", assigneeId: "t", version: 2 }}
      user={technician}
      onChanged={() => {}}
    />,
  );
  await userEvent.type(
    screen.getByLabelText("Resolution note"),
    "  Replaced cable  ",
  );
  await userEvent.click(screen.getByRole("button", { name: "Mark resolved" }));
  expect(api.act).toHaveBeenCalledWith("r", {
    action: "resolve",
    expectedVersion: 2,
    note: "Replaced cable",
  });
});
it("reporter can reopen with a reason or close without one", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "act").mockResolvedValue({ request: item });
  render(
    <WorkflowControls
      api={api}
      item={{ ...item, status: "resolved", version: 3 }}
      user={student}
      onChanged={() => {}}
    />,
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Reopen request" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "operational note",
  );
  expect(api.act).not.toHaveBeenCalled();
  await userEvent.type(
    screen.getByLabelText("Reason for reopening"),
    "Fault returned",
  );
  await userEvent.click(screen.getByRole("button", { name: "Reopen request" }));
  expect(api.act).toHaveBeenCalledWith("r", {
    action: "reopen",
    expectedVersion: 3,
    note: "Fault returned",
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm and close" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Confirm change" }));
  expect(api.act).toHaveBeenCalledWith("r", {
    action: "close",
    expectedVersion: 3,
  });
});
it("technician directory failure has a retry and empty state", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "technicians")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
  render(
    <WorkflowControls
      api={api}
      item={item}
      user={coordinator}
      onChanged={() => {}}
    />,
  );
  await screen.findByRole("alert");
  await userEvent.click(
    screen.getByRole("button", { name: "Retry technicians" }),
  );
  expect(
    await screen.findByText("No technicians are available in the directory."),
  ).toBeVisible();
});
it("history paginates and renders notes as text", async () => {
  const api = new ApiClient();
  vi.spyOn(api, "history").mockResolvedValue({
    items: [
      {
        id: 1,
        action: "resolve",
        previousStatus: "in_progress",
        nextStatus: "resolved",
        requestVersion: 3,
        note: "<script>not executable</script>",
        createdAt: "2026-10-12",
        actorRole: "technician",
      },
    ],
    page: 1,
    limit: 1,
    total: 2,
  });
  render(<RequestHistory api={api} id="r" />);
  expect(
    await screen.findByText("<script>not executable</script>"),
  ).toBeVisible();
  expect(document.querySelector("script")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Older events" }));
  await waitFor(() =>
    expect(api.history).toHaveBeenLastCalledWith(
      "r",
      2,
      expect.any(AbortSignal),
    ),
  );
});
it("terminal closed state has no mutation buttons", () => {
  render(
    <WorkflowControls
      api={new ApiClient()}
      item={{ ...item, status: "closed" }}
      user={student}
      onChanged={() => {}}
    />,
  );
  expect(screen.getByText("This request is closed.")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
