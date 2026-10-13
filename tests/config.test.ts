import { expect, it } from "vitest";
import { readConfig } from "../src/config.js";
const base = {
  DATABASE_URL: "postgresql://user:secret@127.0.0.1:55432/campusfix",
};
it("configuration defaults are explicit", () =>
  expect(readConfig(base).PORT).toBe(3100));
it("configuration errors do not echo secrets", () => {
  try {
    readConfig({ ...base, DATABASE_URL: "secret-value" });
  } catch (e) {
    expect(String(e)).not.toContain("secret-value");
  }
});
it("rejects non PostgreSQL connections", () =>
  expect(() =>
    readConfig({ ...base, DATABASE_URL: "https://user:secret@example.com/db" }),
  ).toThrow());
it("production requires HTTPS origin", () =>
  expect(() => readConfig({ ...base, NODE_ENV: "production" })).toThrow());
it("rejects invalid ports", () =>
  expect(() => readConfig({ ...base, PORT: "abc" })).toThrow());

it("rejects inconsistent database ports", () =>
  expect(() => readConfig({ ...base, DB_PORT: "5432" })).toThrow("DB_PORT"));
it("rejects inconsistent database passwords without revealing them", () => {
  try {
    readConfig({ ...base, DB_PASSWORD: "different-secret" });
    throw new Error("Expected failure");
  } catch (error) {
    expect(String(error)).toContain("DB_PASSWORD");
    expect(String(error)).not.toContain("different-secret");
  }
});
