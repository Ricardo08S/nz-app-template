import { TRPCError } from "@trpc/server";
import { unauthorizedError, hashPassword } from "../common";
import { z } from "../lib";
import { tuser } from "../trpc";

export const setupPassword = tuser
  .input(
    z.object({
      newPassword: z.string().min(8),
    }),
  )
  .mutation(async ({ ctx: { db, user, log }, input }) => {
    if (!user) {
      throw unauthorizedError;
    }

    const found = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true, oidc_issuer: true },
    });
    if (!found) {
      throw unauthorizedError;
    }

    if (!found.oidc_issuer) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This account already signs in with a password. Use change password instead.",
      });
    }

    if (found.passwordHash) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Password already set up. Use change password instead.",
      });
    }

    const newHashed = hashPassword(input.newPassword);
    await db.user.update({
      where: { id: found.id },
      data: { passwordHash: newHashed },
    });

    log.info(`setupPassword`, { userId: found.id });

    return { success: true };
  });
