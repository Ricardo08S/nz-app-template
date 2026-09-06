import { TRPCError } from "@trpc/server";
import { unauthorizedError, hashPassword } from "../common";
import { bcrypt, z } from "../lib";
import { tuser } from "../trpc";

export const changePassword = tuser
  .input(
    z.object({
      oldPassword: z.string(),
      newPassword: z.string(),
    }),
  )
  .mutation(async ({ ctx: { db, user, log }, input }) => {
    if (!user?.username) {
      throw unauthorizedError;
    }

    const found = await db.user.findUnique({
      where: { username: user.username },
      select: { username: true, passwordHash: true },
    });
    if (!found?.passwordHash) {
      throw unauthorizedError;
    }

    // old must match
    if (!bcrypt.compareSync(input.oldPassword, found.passwordHash)) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Wrong old password.",
      });
    }

    // new must be different from old
    if (bcrypt.compareSync(input.newPassword, found.passwordHash)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "New password must be different from the old password.",
      });
    }

    const newHashed = hashPassword(input.newPassword);
    await db.user.update({
      where: { username: found.username },
      data: { passwordHash: newHashed },
    });

    // Never log input verbatim - it's the old/new plaintext passwords, and
    // logs go to stdout/Loki, which far more people can read than the DB.
    log.info(`changePassword`, { username: found.username });

    return { success: true };
  });
