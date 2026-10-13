import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
const N = 131072;
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return (
    "scrypt$" + salt + "$" + (await derive(password, salt)).toString("hex")
  );
}
export async function verifyPassword(password: string, hash: string) {
  const [kind, salt, encoded] = hash.split("$");
  if (
    kind !== "scrypt" ||
    !salt ||
    !encoded ||
    !/^[a-f0-9]{128}$/.test(encoded)
  )
    return false;
  return timingSafeEqual(
    await derive(password, salt),
    Buffer.from(encoded, "hex"),
  );
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
