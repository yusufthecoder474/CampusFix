import request from "supertest";
import { it, expect } from "vitest";
import { createApp } from "../src/app.js";
it("liveness succeeds independently of database availability", async () => {
  const result = await request(
    createApp(async () => {
      throw new Error("private connection string");
    }),
  ).get("/health/live");
  expect(result.status).toBe(200);
  expect(result.body).toEqual({ status: "ok" });
});
it("readiness checks its database dependency", async () => {
  let checked = false;
  const result = await request(
    createApp(async () => {
      checked = true;
    }),
  ).get("/health/ready");
  expect(checked).toBe(true);
  expect(result.status).toBe(200);
});
it("database failures are 503 without leaking internals", async () => {
  const result = await request(
    createApp(async () => {
      throw new Error("private password");
    }),
  ).get("/health/ready");
  expect(result.status).toBe(503);
  expect(result.text).not.toContain("private");
  expect(result.body.error.requestId).toBe(result.headers["x-request-id"]);
});
it("unknown routes produce consistent JSON errors", async () => {
  const result = await request(createApp(async () => {})).get("/missing");
  expect(result.status).toBe(404);
  expect(result.body.error.code).toBe("NOT_FOUND");
});
it("malformed JSON is rejected without a stack trace", async () => {
  const result = await request(createApp(async () => {}))
    .post("/missing")
    .set("Content-Type", "application/json")
    .send("{");
  expect(result.status).toBe(400);
  expect(result.body.error.code).toBe("INVALID_JSON");
});
it("oversized JSON returns a bounded 413 without exposing parser internals", async () => {
  const result = await request(createApp(async () => {}))
    .post("/missing")
    .send({ description: "private-payload-".repeat(2000) });
  expect(result.status).toBe(413);
  expect(result.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  expect(result.body.error.requestId).toBe(result.headers["x-request-id"]);
  expect(result.text).not.toContain("private-payload");
  expect(result.text).not.toContain("stack");
});
