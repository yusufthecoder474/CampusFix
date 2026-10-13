import { describe, it, expect } from "vitest";
import {
  transition,
  type Action,
  type Status,
  type Role,
} from "../src/domain/workflow.js";
const cases: [Action, Status, Status, Role, string][] = [
  ["triage", "reported", "available", "coordinator", "c"],
  ["claim", "available", "in_progress", "technician", "t"],
  ["resolve", "in_progress", "resolved", "technician", "t"],
  ["close", "resolved", "closed", "student", "s"],
  ["reopen", "resolved", "in_progress", "student", "s"],
];
describe("maintenance workflow", () => {
  it.each(cases)(
    "%s permits the correct actor and state",
    (action, status, expected, role, id) => {
      expect(
        transition(
          {
            reporterId: "s",
            assigneeId:
              status === "reported" || status === "available" ? null : "t",
            status,
          },
          { id, role },
          action,
        ),
      ).toBe(expected);
    },
  );
  it.each(cases)(
    "%s rejects a terminal closed request",
    (action, _status, _expected, role, id) => {
      expect(() =>
        transition(
          { reporterId: "s", assigneeId: "t", status: "closed" },
          { id, role },
          action,
        ),
      ).toThrow("CONFLICT");
    },
  );
  it("students cannot claim jobs", () => {
    expect(() =>
      transition(
        { reporterId: "s", assigneeId: null, status: "available" },
        { id: "s", role: "student" },
        "claim",
      ),
    ).toThrow("FORBIDDEN");
  });
  it("a different technician cannot resolve another technician job", () => {
    expect(() =>
      transition(
        { reporterId: "s", assigneeId: "t", status: "in_progress" },
        { id: "other", role: "technician" },
        "resolve",
      ),
    ).toThrow("FORBIDDEN");
  });
  it.each(["close", "reopen"] as Action[])(
    "another student cannot %s",
    (action) => {
      expect(() =>
        transition(
          { reporterId: "s", assigneeId: "t", status: "resolved" },
          { id: "other", role: "student" },
          action,
        ),
      ).toThrow("FORBIDDEN");
    },
  );
  it("claim rejects already assigned work even if its status is corrupt", () => {
    expect(() =>
      transition(
        { reporterId: "s", assigneeId: "t", status: "available" },
        { id: "other", role: "technician" },
        "claim",
      ),
    ).toThrow("CONFLICT");
  });
});
