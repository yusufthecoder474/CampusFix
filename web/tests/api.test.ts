import { it, expect, vi } from "vitest";
import { ApiClient } from "../src/api";
it("uses cookie credentials and session CSRF but never manually sets Origin", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ user: {}, csrfToken: "abc" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ request: {} }),
    });
  vi.stubGlobal("fetch", fetcher);
  const api = new ApiClient();
  await api.me();
  await api.create({
    title: "Title",
    description: "Description",
    location: "Room",
  });
  const options = fetcher.mock.calls[1]![1];
  expect(options.credentials).toBe("same-origin");
  expect(options.headers["X-CSRF-Token"]).toBe("abc");
  expect(options.headers).not.toHaveProperty("Origin");
});
it("401 clears authenticated state while login errors do not", async () => {
  const expired = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: "AUTHENTICATION_REQUIRED" } }),
    }),
  );
  const api = new ApiClient(expired);
  await expect(api.login("a", "b")).rejects.toThrow();
  expect(expired).not.toHaveBeenCalled();
  await expect(api.me()).rejects.toThrow();
  expect(expired).toHaveBeenCalledOnce();
});
