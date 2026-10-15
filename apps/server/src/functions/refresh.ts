import { TRPCError } from "@trpc/server";
import { generateTokensFromUser, verifyRefreshToken } from "../common.js";
import { z } from "../lib.js";
import { t } from "../trpc.js";

export const refresh = t.procedure
  .input(
    z.object({
      refreshToken: z.string().nonempty(),
    }),
  )
  .mutation(async ({ ctx, ctx: { db, log }, input }) => {
    const payload = verifyRefreshToken(input.refreshToken);
    const refresh = await db.refreshToken.findUnique({
      where: {
        id: payload.id,
      },
      include: {
        User: true,
      },
    });
    if (!refresh || refresh.revoked) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid or expired token.",
      });
    }

    const { User: user } = refresh;
    const { accessToken, refreshToken } = await generateTokensFromUser(
      ctx,
      user,
      payload.impersonation,
    );
    await db.refreshToken.delete({
      where: {
        id: payload.id,
      },
    });

    log.info(`trpc.refresh`, { accessToken, refreshToken });

    return { accessToken, refreshToken };
  });
