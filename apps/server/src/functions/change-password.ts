import { TRPCError } from "@trpc/server";
import { unauthorizedError, hashPassword } from "../common.js";
import { bcrypt, z } from "../lib.js";
import { tuser } from "../trpc.js";

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
      select: { username: true, password: true },
    });
    if (!found?.password) {
      throw unauthorizedError;
    }

    // old must match
    if (!bcrypt.compareSync(input.oldPassword, found.password)) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Wrong old password.",
      });
    }

    // new must be different from old
    if (bcrypt.compareSync(input.newPassword, found.password)) {
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

    log.info(`changePassword`, {
      input,
    });

    return { success: true };
  });
