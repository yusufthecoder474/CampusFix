import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { parseCookie } from "cookie";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { AuthService } from "./auth/service.js";
import { requests } from "./db/schema.js";
import type { Database } from "./db/client.js";
import type { Config } from "./config.js";
import { ApiError } from "./errors.js";
export interface Change {
  requestId: string;
  version: number;
  action: string;
}
export type Publish = (
  id: string,
  version: number,
  action: string,
) => Promise<void>;
export function attachRealtime(
  server: HttpServer,
  db: Database,
  config: Config,
) {
  const auth = new AuthService(db, config.SESSION_HOURS);
  const io = new Server(server, {
    transports: ["websocket"],
    maxHttpBufferSize: 2048,
    allowRequest: (req, done) =>
      done(null, req.headers.origin === config.APP_ORIGIN),
    serveClient: false,
  });
  const cookieName =
    config.NODE_ENV === "production" ? "__Host-campusfix" : "campusfix";
  io.use(async (socket, next) => {
    try {
      const token = parseCookie(socket.request.headers.cookie ?? "")[
        cookieName
      ];
      const actor = await auth.authenticate(token);
      const supplied = socket.handshake.auth.csrfToken as unknown;
      const expected = createHmac("sha256", token!)
        .update("campusfix-csrf")
        .digest("hex");
      if (
        typeof supplied !== "string" ||
        !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
      )
        return next(new Error("CSRF_REJECTED"));
      socket.data.token = token;
      socket.data.actor = actor;
      next();
    } catch (e) {
      next(new Error(e instanceof ApiError ? e.code : "LIVE_UNAVAILABLE"));
    }
  });
  io.on("connection", (socket) => {
    // There is no client room-selection API. Arbitrary subscriptions cannot expand access.
    socket.on("subscribe", (_room: unknown, ack: unknown) => {
      if (typeof ack === "function") ack({ error: "FORBIDDEN" });
    });
  });
  async function check(
    socket: typeof io.sockets.sockets extends Map<string, infer S> ? S : never,
  ) {
    try {
      const current = await auth.authenticate(socket.data.token as string);
      if (
        current.id !== socket.data.actor.id ||
        current.role !== socket.data.actor.role
      )
        throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      return current;
    } catch (e) {
      if (e instanceof ApiError) {
        socket.emit("session:expired");
        socket.disconnect(true);
      } else {
        socket.emit("live:unavailable");
        socket.disconnect(true);
      }
      return null;
    }
  }
  const timer = setInterval(() => {
    for (const socket of io.sockets.sockets.values()) void check(socket);
  }, 30000);
  timer.unref();
  const publish: Publish = async (id, version, action) => {
    if (io.sockets.sockets.size === 0) return;
    const [row] = await db
      .select({
        reporterId: requests.reporterId,
        assigneeId: requests.assigneeId,
      })
      .from(requests)
      .where(eq(requests.id, id));
    if (!row) return;
    for (const socket of io.sockets.sockets.values()) {
      const actor = await check(socket);
      if (
        actor &&
        (actor.role === "coordinator" ||
          actor.id === row.reporterId ||
          actor.id === row.assigneeId)
      )
        socket.emit("request:changed", {
          requestId: id,
          version,
          action,
        } satisfies Change);
    }
  };
  return {
    io,
    publish,
    close: async () => {
      clearInterval(timer);
      await new Promise<void>((ok) => io.close(() => ok()));
    },
  };
}
