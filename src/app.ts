import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { ApiError } from "./errors.js";
import { apiRouter } from "./api.js";
import type { Database } from "./db/client.js";
import type { Config } from "./config.js";
import { randomUUID } from "node:crypto";
export function createApp(
  checkDatabase: () => Promise<void>,
  services?: {
    db: Database;
    config: Config;
    webRoot?: string;
    publish?: import("./realtime.js").Publish;
  },
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "upgrade-insecure-requests":
            services?.config.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );
  app.use((_req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader("X-Request-Id", res.locals.requestId as string);
    const started = performance.now();
    res.on("finish", () =>
      console.log(
        JSON.stringify({
          event: "http_request",
          requestId: res.locals.requestId,
          method: _req.method,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - started),
        }),
      ),
    );
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.get("/health/live", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/health/ready", async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({
        error: {
          code: "DATABASE_UNAVAILABLE",
          requestId: res.locals.requestId,
        },
      });
    }
  });
  if (services)
    app.use("/api", apiRouter(services.db, services.config, services.publish));
  if (services?.webRoot) {
    app.use(
      "/assets",
      express.static(services.webRoot + "/assets", {
        index: false,
        immutable: true,
        maxAge: "1y",
      }),
    );
    app.get("/", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile("index.html", { root: services.webRoot });
    });
  }
  app.use((_req, res) => {
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", requestId: res.locals.requestId } });
  });
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ApiError || error instanceof ZodError) {
      res.status(error instanceof ApiError ? error.status : 400).json({
        error: {
          code: error instanceof ApiError ? error.code : "VALIDATION_ERROR",
          requestId: res.locals.requestId,
        },
      });
      return;
    }
    console.error(
      JSON.stringify({
        event: "request_error",
        requestId: res.locals.requestId,
      }),
    );
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? error.status
        : undefined;
    const code =
      status === 413
        ? "PAYLOAD_TOO_LARGE"
        : status === 400
          ? "INVALID_JSON"
          : "INTERNAL_ERROR";
    res
      .status(status === 413 ? 413 : status === 400 ? 400 : 500)
      .json({ error: { code, requestId: res.locals.requestId } });
  };
  app.use(errors);
  return app;
}
