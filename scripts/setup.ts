import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const password = randomBytes(24).toString("hex");
const seed = randomBytes(16).toString("hex");
const contents = `NODE_ENV=development\nHOST=127.0.0.1\nPORT=3100\nAPP_ORIGIN=http://127.0.0.1:3100\nDB_PORT=55432\nDB_PASSWORD=${password}\nDATABASE_URL=postgresql://campusfix:${password}@127.0.0.1:55432/campusfix\nTEST_DATABASE_URL=postgresql://campusfix:${password}@127.0.0.1:55432/campusfix_test\nSESSION_HOURS=8\nSEED_PASSWORD=${seed}\n`;
try {
  await writeFile(".env", contents, { flag: "wx", mode: 0o600 });
  console.log(
    "Created .env with random local credentials. Read SEED_PASSWORD locally for demo login.",
  );
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "EEXIST")
    console.log(
      "Existing .env preserved. Compare it with .env.example and follow upgrade instructions.",
    );
  else throw error;
}
