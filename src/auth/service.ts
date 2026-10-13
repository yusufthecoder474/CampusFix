import { and, eq, gt } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { users, sessions } from "../db/schema.js";
import {
  verifyPassword,
  hashPassword,
  tokenHash,
  newToken,
} from "./password.js";
import { ApiError } from "../errors.js";
import type { Role } from "../domain/workflow.js";
export interface Principal {
  id: string;
  role: Role;
  displayName: string;
}
export class AuthService {
  private dummyHash = hashPassword(newToken());
  constructor(
    private db: Database,
    private hours: number,
  ) {}
  async login(email: string, password: string, previousToken?: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    const valid = await verifyPassword(
      password,
      user?.passwordHash ?? (await this.dummyHash),
    );
    if (!user || !valid) throw new ApiError(401, "INVALID_CREDENTIALS");
    const token = newToken();
    await this.db.transaction(async (tx) => {
      if (previousToken)
        await tx
          .delete(sessions)
          .where(eq(sessions.tokenHash, tokenHash(previousToken)));
      await tx.insert(sessions).values({
        tokenHash: tokenHash(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + this.hours * 3600000),
      });
    });
    return {
      token,
      user: {
        id: user.id,
        role: user.role as Role,
        displayName: user.displayName,
      },
    };
  }
  async authenticate(token: string | undefined): Promise<Principal> {
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new ApiError(401, "AUTHENTICATION_REQUIRED");
    const [row] = await this.db
      .select({
        id: users.id,
        role: users.role,
        displayName: users.displayName,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash(token)),
          gt(sessions.expiresAt, new Date()),
        ),
      );
    if (!row) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
    return { ...row, role: row.role as Role };
  }
  async logout(token: string) {
    await this.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, tokenHash(token)));
  }
}
