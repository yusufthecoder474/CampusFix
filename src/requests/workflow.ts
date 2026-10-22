import { and, asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { requests, events, users } from "../db/schema.js";
import type { Principal } from "../auth/service.js";
import { ApiError } from "../errors.js";
import { RequestService } from "./service.js";

const expectedVersion = z.number().int().min(0).max(2147483646);
const note = z.string().trim().min(1).max(2000);
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("triage"), expectedVersion }).strict(),
  z
    .object({
      action: z.literal("assign"),
      expectedVersion,
      technicianId: z.string().uuid(),
    })
    .strict(),
  z.object({ action: z.literal("resolve"), expectedVersion, note }).strict(),
  z.object({ action: z.literal("reopen"), expectedVersion, note }).strict(),
  z.object({ action: z.literal("close"), expectedVersion }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const pageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export class WorkflowService {
  constructor(private db: Database) {}
  async execute(actor: Principal, id: string, raw: unknown) {
    const input = commandSchema.parse(raw);
    // Reject wrong roles before looking up private request IDs.
    const permittedRole =
      input.action === "triage" || input.action === "assign"
        ? "coordinator"
        : input.action === "resolve"
          ? "technician"
          : "student";
    if (actor.role !== permittedRole) throw new ApiError(403, "FORBIDDEN");
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(requests)
        .where(eq(requests.id, id))
        .for("update");
      if (
        !row ||
        (actor.role === "student" && row.reporterId !== actor.id) ||
        (actor.role === "technician" && row.assigneeId !== actor.id)
      )
        throw new ApiError(404, "NOT_FOUND");
      if (row.version !== input.expectedVersion)
        throw new ApiError(409, "STALE_VERSION");
      const from = {
        triage: "reported",
        assign: "available",
        resolve: "in_progress",
        reopen: "resolved",
        close: "resolved",
      }[input.action];
      if (
        row.status !== from ||
        ((input.action === "triage" || input.action === "assign") &&
          row.assigneeId !== null)
      )
        throw new ApiError(409, "INVALID_TRANSITION");
      let assigneeId = row.assigneeId;
      if (input.action === "assign") {
        // Lock target role as well; the composite FK is the independent database safeguard.
        const [technician] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(eq(users.id, input.technicianId), eq(users.role, "technician")),
          )
          .for("share");
        if (!technician) throw new ApiError(400, "INVALID_TECHNICIAN");
        assigneeId = technician.id;
      }
      const nextStatus = {
        triage: "available",
        assign: "in_progress",
        resolve: "resolved",
        reopen: "in_progress",
        close: "closed",
      }[input.action];
      const [updated] = await tx
        .update(requests)
        .set({
          status: nextStatus,
          assigneeId,
          version: row.version + 1,
          updatedAt: new Date(),
          resolutionNote:
            input.action === "resolve"
              ? input.note
              : input.action === "reopen"
                ? null
                : row.resolutionNote,
        })
        .where(
          and(eq(requests.id, id), eq(requests.version, input.expectedVersion)),
        )
        .returning();
      if (!updated) throw new ApiError(409, "STALE_VERSION");
      await tx.insert(events).values({
        requestId: id,
        actorId: actor.id,
        action: input.action,
        previousStatus: row.status,
        nextStatus,
        requestVersion: updated.version,
        assigneeId,
        note: "note" in input ? input.note : null,
      });
      if (actor.role !== "technician") return updated;
      const {
        reporterId: _reporter,
        description: _description,
        ...safe
      } = updated;
      return safe;
    }, { isolationLevel: "read committed" });
  }
  async technicians(actor: Principal, page: { page: number; limit: number }) {
    if (actor.role !== "coordinator") throw new ApiError(403, "FORBIDDEN");
    return this.db.transaction(
      async (tx) => {
        const items = await tx
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(eq(users.role, "technician"))
          .orderBy(asc(users.displayName), asc(users.id))
          .limit(page.limit)
          .offset((page.page - 1) * page.limit);
        const [total] = await tx
          .select({ value: count() })
          .from(users)
          .where(eq(users.role, "technician"));
        return { ...page, items, total: total?.value ?? 0 };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
  async history(
    actor: Principal,
    id: string,
    page: { page: number; limit: number },
  ) {
    const row = await new RequestService(this.db).get(actor, id);
    if (actor.role === "technician" && row.assigneeId !== actor.id)
      throw new ApiError(403, "FORBIDDEN");
    return this.db.transaction(
      async (tx) => {
        const items = await tx
          .select({
            id: events.id,
            action: events.action,
            previousStatus: events.previousStatus,
            nextStatus: events.nextStatus,
            requestVersion: events.requestVersion,
            note: events.note,
            createdAt: events.createdAt,
            actorRole: users.role,
          })
          .from(events)
          .innerJoin(users, eq(events.actorId, users.id))
          .where(eq(events.requestId, id))
          .orderBy(desc(events.id))
          .limit(page.limit)
          .offset((page.page - 1) * page.limit);
        const [total] = await tx
          .select({ value: count() })
          .from(events)
          .where(eq(events.requestId, id));
        return { ...page, items, total: total?.value ?? 0 };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
