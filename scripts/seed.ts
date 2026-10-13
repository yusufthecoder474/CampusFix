import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { connectDatabase } from "../src/db/client.js";
import { users, requests, events } from "../src/db/schema.js";
import { hashPassword } from "../src/auth/password.js";
import { readConfig } from "../src/config.js";
import type { Database } from "../src/db/client.js";
export async function seed(db: Database, password: string) {
  if (password.length < 16 || password === "CHANGE_ME")
    throw new Error("SEED_PASSWORD must be at least 16 characters");
  const hash = await hashPassword(password);
  const accounts = [
    ["student1@campusfix.test", "Asha Demo", "student"],
    ["student2@campusfix.test", "Ravi Demo", "student"],
    ["coordinator@campusfix.test", "Priya Demo", "coordinator"],
    ["technician1@campusfix.test", "Sam Demo", "technician"],
    ["technician2@campusfix.test", "Lee Demo", "technician"],
  ] as const;
  await db.transaction(async (tx) => {
    for (const [email, displayName, role] of accounts) {
      const [exists] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email));
      if (!exists)
        await tx.insert(users).values({
          id: randomUUID(),
          email,
          displayName,
          role,
          passwordHash: hash,
        });
    }
    // Never overwrite passwords or duplicate fixtures on subsequent seed runs.
    const existing = await tx
      .select({ id: requests.id })
      .from(requests)
      .limit(1);
    if (existing.length) return;
    const all = await tx.select().from(users);
    const student = all.find((u) => u.email === accounts[0][0])!;
    const other = all.find((u) => u.email === accounts[1][0])!;
    for (const [title, description, location, reporter] of [
      [
        "Ceiling fan not turning",
        "Ceiling fan stops after a few seconds.",
        "Hostel A",
        student.id,
      ],
      [
        "Water tap leaking",
        "Wash basin tap continues dripping after closing.",
        "Hostel B",
        other.id,
      ],
      [
        "Projector display flickers",
        "Display flickers while showing lecture slides.",
        "Room 204",
        student.id,
      ],
    ]) {
      const id = randomUUID();
      await tx.insert(requests).values({
        id,
        title: title!,
        description: description!,
        location: location!,
        reporterId: reporter!,
      });
      await tx.insert(events).values({
        requestId: id,
        actorId: reporter!,
        action: "create",
        nextStatus: "reported",
      });
    }
  });
}
if (process.argv[1]?.endsWith("seed.ts")) {
  const config = readConfig();
  if (config.NODE_ENV === "production")
    throw new Error("Demo seeding is disabled in production");
  const { pool, db } = connectDatabase(config.DATABASE_URL);
  try {
    await seed(db, process.env.SEED_PASSWORD ?? "");
    console.log(
      "Synthetic accounts seeded. Existing accounts and passwords preserved. See docs/WINDOWS.md.",
    );
  } finally {
    await pool.end();
  }
}
