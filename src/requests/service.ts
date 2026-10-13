import { randomUUID } from "node:crypto";
import { and, eq, or, desc, count, type SQL } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { requests, events } from "../db/schema.js";
import type { Principal } from "../auth/service.js";
import { ApiError } from "../errors.js";
export interface NewRequest {
  title: string;
  description: string;
  location: string;
}
export interface Filters {
  page: number;
  limit: number;
  status?: string;
  location?: string;
}
export class RequestService {
  constructor(private db: Database) {}
  private scope(actor: Principal): SQL | undefined {
    if (actor.role === "student") return eq(requests.reporterId, actor.id);
    if (actor.role === "technician")
      return or(
        eq(requests.status, "available"),
        eq(requests.assigneeId, actor.id),
      );
    return undefined;
  }
  private redact(row: typeof requests.$inferSelect, actor: Principal) {
    if (actor.role !== "technician") return row;
    // Available-work descriptions can include personal information: don't expose them.
    const { reporterId: _reporter, description: _description, ...safe } = row;
    return safe;
  }
  async create(actor: Principal, input: NewRequest) {
    if (actor.role !== "student") throw new ApiError(403, "FORBIDDEN");
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(requests)
        .values({ ...input, id: randomUUID(), reporterId: actor.id })
        .returning();
      if (!row) throw new Error("Insert returned no row");
      await tx.insert(events).values({
        requestId: row.id,
        actorId: actor.id,
        action: "create",
        requestVersion: 0,
        nextStatus: "reported",
      });
      return row;
    });
  }
  async get(actor: Principal, id: string) {
    const [row] = await this.db
      .select()
      .from(requests)
      .where(and(eq(requests.id, id), this.scope(actor)));
    if (!row) throw new ApiError(404, "NOT_FOUND");
    return this.redact(row, actor);
  }
  async list(actor: Principal, filter: Filters) {
    const where = and(
      this.scope(actor),
      filter.status ? eq(requests.status, filter.status) : undefined,
      filter.location ? eq(requests.location, filter.location) : undefined,
    );
    return this.db.transaction(
      async (tx) => {
        const rows = await tx
          .select()
          .from(requests)
          .where(where)
          .orderBy(desc(requests.createdAt), desc(requests.id))
          .limit(filter.limit)
          .offset((filter.page - 1) * filter.limit);
        const [total] = await tx
          .select({ value: count() })
          .from(requests)
          .where(where);
        return {
          items: rows.map((row) => this.redact(row, actor)),
          page: filter.page,
          limit: filter.limit,
          total: total?.value ?? 0,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
