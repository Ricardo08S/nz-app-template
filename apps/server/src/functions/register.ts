import { TRPCError } from "@trpc/server";
import { hashPassword, generateTokensFromUser } from "../common.js";
import { z } from "../lib.js";
import { t } from "../trpc.js";
import { Role } from "../zenstack/models.js";

export const register = t.procedure
  .input(
    z.object({
      name: z.string().nonempty(),
      username: z.string().nonempty(),
      password: z.string().nonempty(),
    }),
  )
  .mutation(async ({ ctx, ctx: { db, log }, input }) => {
    const checkUser = await db.user.findUnique({
      where: {
        username: input.username,
      },
    });
    if (checkUser) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Username already exists.",
      });
    }

    const passwordHash = hashPassword(input.password);

    const user = await db.user.create({
      data: {
        name: input.name,
        username: input.username,
        passwordHash,
        role: Role.USER,
      },
    });

    const tokens = await generateTokensFromUser(ctx, user);

    log.info(`trpc.register`, { input, tokens });

    return tokens;
  });
