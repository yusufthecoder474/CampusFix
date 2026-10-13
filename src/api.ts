import { Router } from "express";
import { parseCookie as parse } from "cookie";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AuthService, type Principal } from "./auth/service.js";
import { WorkflowService, pageSchema } from "./requests/workflow.js";
import { RequestService } from "./requests/service.js";
import type { Database } from "./db/client.js";
import type { Config } from "./config.js";
import { ApiError } from "./errors.js";
export function apiRouter(
  db: Database,
  config: Config,
  publish?: import("./realtime.js").Publish,
) {
  async function changed(id: string, version: number, action: string) {
    try {
      await publish?.(id, version, action);
    } catch {
      console.error(JSON.stringify({ event: "realtime_publish_failed" }));
    }
  }
  const router = Router(),
    auth = new AuthService(db, config.SESSION_HOURS),
    requests = new RequestService(db),
    workflow = new WorkflowService(db);
  const secure = config.NODE_ENV === "production";
  const cookieName = secure ? "__Host-campusfix" : "campusfix";
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
  };
  const csrf = (token: string) =>
    createHmac("sha256", token).update("campusfix-csrf").digest("hex");
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({
          error: { code: "RATE_LIMITED", requestId: res.locals.requestId },
        }),
    }),
  );
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.use((req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.get("origin") !== config.APP_ORIGIN)
        throw new ApiError(403, "ORIGIN_REJECTED");
      if (!req.is("application/json")) throw new ApiError(415, "JSON_REQUIRED");
    }
    next();
  });
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          code: "LOGIN_RATE_LIMITED",
          requestId: res.locals.requestId,
        },
      }),
  });
  const login = z
    .object({
      email: z.string().trim().toLowerCase().email().max(254),
      password: z.string().min(1).max(128),
    })
    .strict();
  router.post("/auth/login", limiter, async (req, res) => {
    const input = login.parse(req.body);
    const oldToken = parse(req.headers.cookie ?? "")[cookieName];
    const result = await auth.login(input.email, input.password, oldToken);
    res.cookie(cookieName, result.token, {
      ...cookieOptions,
      maxAge: config.SESSION_HOURS * 3600000,
    });
    res.json({ user: result.user, csrfToken: csrf(result.token) });
  });
  router.use(async (req, res, next) => {
    const token = parse(req.headers.cookie ?? "")[cookieName];
    res.locals.actor = await auth.authenticate(token);
    res.locals.token = token;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const supplied = req.get("x-csrf-token") ?? "";
      const expected = csrf(token!);
      if (
        !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
      )
        throw new ApiError(403, "CSRF_REJECTED");
    }
    next();
  });
  router.get("/auth/me", (_req, res) =>
    res.json({
      user: res.locals.actor,
      csrfToken: csrf(res.locals.token as string),
    }),
  );
  router.post("/auth/logout", async (_req, res) => {
    await auth.logout(res.locals.token as string);
    res.clearCookie(cookieName, cookieOptions);
    res.status(204).end();
  });
  const body = z
    .object({
      title: z.string().trim().min(5).max(120),
      description: z.string().trim().min(10).max(2000),
      location: z.string().trim().min(2).max(120),
    })
    .strict();
  const filters = z
    .object({
      page: z.coerce.number().int().min(1).max(10000).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      status: z
        .enum(["reported", "available", "in_progress", "resolved", "closed"])
        .optional(),
      location: z.string().trim().min(2).max(120).optional(),
    })
    .strict();
  router.post("/requests", async (req, res) => {
    const row = await requests.create(
      res.locals.actor as Principal,
      body.parse(req.body),
    );
    await changed(row.id, row.version, "create");
    res.status(201).json({ request: row });
  });
  router.get("/requests", async (req, res) =>
    res.json(
      await requests.list(
        res.locals.actor as Principal,
        filters.parse(req.query),
      ),
    ),
  );
  router.get("/requests/:id", async (req, res) =>
    res.json({
      request: await requests.get(
        res.locals.actor as Principal,
        z.string().uuid().parse(req.params.id),
      ),
    }),
  );
  router.get("/technicians", async (req, res) =>
    res.json(
      await workflow.technicians(
        res.locals.actor as Principal,
        pageSchema.parse(req.query),
      ),
    ),
  );
  router.get("/requests/:id/events", async (req, res) =>
    res.json(
      await workflow.history(
        res.locals.actor as Principal,
        z.string().uuid().parse(req.params.id),
        pageSchema.parse(req.query),
      ),
    ),
  );
  router.post("/requests/:id/actions", async (req, res) => {
    const row = await workflow.execute(
      res.locals.actor as Principal,
      z.string().uuid().parse(req.params.id),
      req.body,
    );
    await changed(row.id, row.version, req.body.action as string);
    res.json({ request: row });
  });
  return router;
}
