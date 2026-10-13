import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  integer,
} from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const requests = pgTable("maintenance_requests", {
  id: uuid("id").primaryKey(),
  reporterId: uuid("reporter_id").notNull(),
  version: integer("version").notNull().default(0),
  assigneeId: uuid("assignee_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  status: text("status").notNull().default("reported"),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const events = pgTable("request_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  requestId: uuid("request_id").notNull(),
  actorId: uuid("actor_id").notNull(),
  action: text("action").notNull(),
  requestVersion: integer("request_version"),
  assigneeId: uuid("assignee_id"),
  note: text("note"),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
// SQL migrations remain authoritative for foreign keys, check constraints and indexes.
