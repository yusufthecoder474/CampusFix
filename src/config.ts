import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3100),
  HOST: z.enum(["127.0.0.1", "0.0.0.0"]).default("127.0.0.1"),
  DB_PORT: z.coerce.number().int().min(1024).max(65535).optional(),
  DB_PASSWORD: z.string().min(1).optional(),
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => {
      const u = new URL(v);
      return (
        ["postgres:", "postgresql:"].includes(u.protocol) &&
        !!u.username &&
        !!u.password &&
        u.pathname.length > 1 &&
        !v.includes("CHANGE_ME")
      );
    }),
  APP_ORIGIN: z.string().url().default("http://127.0.0.1:3100"),
  SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      "Invalid configuration fields: " +
        [...new Set(result.error.issues.map((i) => i.path.join(".")))].join(
          ", ",
        ) +
        ". See .env.example; secret values are omitted.",
    );
  const c = result.data;
  const origin = new URL(c.APP_ORIGIN);
  if (
    origin.origin !== c.APP_ORIGIN ||
    (c.NODE_ENV === "production" && origin.protocol !== "https:")
  )
    throw new Error(
      "APP_ORIGIN must be an exact origin; production requires HTTPS.",
    );
  if (
    c.NODE_ENV !== "production" &&
    Number(origin.port || (origin.protocol === "https:" ? 443 : 80)) !== c.PORT
  )
    throw new Error("Local APP_ORIGIN port must match PORT.");
  const database = new URL(c.DATABASE_URL);
  if (c.DB_PORT !== undefined && Number(database.port || 5432) !== c.DB_PORT)
    throw new Error("DB_PORT must match the port in DATABASE_URL.");
  if (
    c.DB_PASSWORD !== undefined &&
    decodeURIComponent(database.password) !== c.DB_PASSWORD
  )
    throw new Error(
      "DB_PASSWORD must match DATABASE_URL credentials. Preserve the password used for the existing volume.",
    );
  return c;
}
export type Config = ReturnType<typeof readConfig>;
