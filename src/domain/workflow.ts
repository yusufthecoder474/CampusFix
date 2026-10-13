export type Role = "student" | "coordinator" | "technician";
export type Status =
  "reported" | "available" | "in_progress" | "resolved" | "closed";
export type Action = "triage" | "claim" | "resolve" | "close" | "reopen";
export interface Actor {
  id: string;
  role: Role;
}
export interface MaintenanceRequest {
  reporterId: string;
  assigneeId: string | null;
  status: Status;
}
export class WorkflowError extends Error {
  constructor(public readonly code: "FORBIDDEN" | "CONFLICT") {
    super(code);
  }
}
// Pure policy: the database service must ALSO enforce atomic transitions.
export function transition(
  request: MaintenanceRequest,
  actor: Actor,
  action: Action,
): Status {
  const rules: Record<Action, { from: Status; to: Status; allowed: boolean }> =
    {
      triage: {
        from: "reported",
        to: "available",
        allowed: actor.role === "coordinator",
      },
      claim: {
        from: "available",
        to: "in_progress",
        allowed: actor.role === "technician",
      },
      resolve: {
        from: "in_progress",
        to: "resolved",
        allowed: actor.role === "technician" && actor.id === request.assigneeId,
      },
      close: {
        from: "resolved",
        to: "closed",
        allowed: actor.role === "student" && actor.id === request.reporterId,
      },
      reopen: {
        from: "resolved",
        to: "in_progress",
        allowed: actor.role === "student" && actor.id === request.reporterId,
      },
    };
  const rule = rules[action];
  if (!rule.allowed) throw new WorkflowError("FORBIDDEN");
  if (
    request.status !== rule.from ||
    (action === "claim" && request.assigneeId !== null)
  )
    throw new WorkflowError("CONFLICT");
  return rule.to;
}
