import { it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render } from "./render";
import { SessionProvider } from "../src/session";
import { ApiClient } from "../src/api";
import { useLive } from "../src/live";
import { QueryClient } from "@tanstack/react-query";
const fixture = vi.hoisted(() => {
  const handlers = new Map<string, Function>(),
    manager = new Map<string, Function>();
  const socket = {
    on: vi.fn((name: string, cb: Function) => {
      handlers.set(name, cb);
      return socket;
    }),
    off: vi.fn((name: string) => {
      handlers.delete(name);
      return socket;
    }),
    connect: vi.fn(() => socket),
    disconnect: vi.fn(() => socket),
    io: {
      on: vi.fn((name: string, cb: Function) => {
        manager.set(name, cb);
        return socket.io;
      }),
      off: vi.fn((name: string) => {
        manager.delete(name);
        return socket.io;
      }),
    },
  };
  return { handlers, manager, socket, factory: vi.fn(() => socket) };
});
vi.mock("socket.io-client", () => ({ io: fixture.factory }));
function Probe() {
  const live = useLive();
  return (
    <>
      <span>{live.status}</span>
      <span>Updates {live.notifications.length}</span>
    </>
  );
}
it("socket hook subscribes once, handles reconnect/stale events and cleans every listener", async () => {
  vi.spyOn(ApiClient.prototype, "me").mockResolvedValue({
    user: { id: "s", role: "student", displayName: "Asha" },
    csrfToken: "x",
  });
  const view = render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await waitFor(() => expect(fixture.factory).toHaveBeenCalledOnce());
  fixture.handlers.get("connect")!();
  expect(await screen.findByText("Live")).toBeVisible();
  fixture.handlers.get("request:changed")!({
    requestId: "r",
    version: 3,
    action: "resolve",
  });
  fixture.handlers.get("request:changed")!({
    requestId: "r",
    version: 2,
    action: "assign",
  });
  expect(await screen.findByText("Updates 1")).toBeVisible();
  fixture.manager.get("reconnect_attempt")!();
  expect(await screen.findByText("Reconnecting")).toBeVisible();
  view.rerender(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  expect(fixture.factory).toHaveBeenCalledOnce();
  view.unmount();
  expect(fixture.handlers.size).toBe(0);
  expect(fixture.manager.size).toBe(0);
  expect(fixture.socket.disconnect).toHaveBeenCalled();
});

it("each connect invalidates authoritative REST caches without replaying notifications", async () => {
  fixture.factory.mockClear();
  vi.spyOn(ApiClient.prototype, "me").mockResolvedValue({
    user: { id: "reconnect", role: "student", displayName: "Demo" },
    csrfToken: "x",
  });
  const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
  const view = render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await waitFor(() => expect(fixture.factory).toHaveBeenCalledOnce());
  fixture.handlers.get("connect")!();
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["history"] }),
  );
  fixture.handlers.get("disconnect")!();
  invalidate.mockClear();
  fixture.handlers.get("connect")!();
  await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
  for (const key of ["requests", "request", "history"])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
  expect(await screen.findByText("Updates 0")).toBeVisible();
  view.unmount();
});
