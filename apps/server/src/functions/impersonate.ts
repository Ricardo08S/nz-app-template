import { TRPCError } from "@trpc/server";
import {
  forbiddenError,
  generateTokensFromUser,
  verifyRefreshToken,
} from "../common.js";
import { z } from "../lib.js";
import { tuser } from "../trpc.js";

// Admin-only. Returns access + refresh tokens for the target user, both
// flagged impersonation: <actor id> (the refresh token carries it as a signed
// claim, so refreshing stays in impersonation mode and the actor can be
// restored server-side by stopImpersonating).
export const impersonate = tuser
  .input(z.object({ userId: z.string().nonempty() }))
  .mutation(async ({ ctx, ctx: { db, log, user: actor }, input }) => {
    if (actor.role !== "ADMIN" || actor.impersonation) {
      throw forbiddenError;
    }
    if (input.userId === actor.id) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot impersonate yourself.",
      });
    }

    const target = await db.user.findUnique({ where: { id: input.userId } });
    if (!target) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
    }

    log.info(`trpc.impersonate`, { actorId: actor.id, targetId: target.id });

    return generateTokensFromUser(ctx, target, actor.id);
  });

// Ends impersonation: revokes the impersonated session's refresh token and
// issues fresh tokens for the original actor, looked up from the claim.
export const stopImpersonating = tuser
  .input(z.object({ refreshToken: z.string().nonempty() }))
  .mutation(async ({ ctx, ctx: { db, log, user }, input }) => {
    if (!user.impersonation) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Not impersonating.",
      });
    }

    const actor = await db.user.findUnique({
      where: { id: user.impersonation },
    });
    if (!actor || actor.role !== "ADMIN") {
      throw forbiddenError;
    }

    // Only drop a refresh token that belongs to this impersonated session.
    const { id } = verifyRefreshToken(input.refreshToken);
    await db.refreshToken.deleteMany({ where: { id, userId: user.id } });

    log.info(`trpc.stopImpersonating`, { actorId: actor.id, targetId: user.id });

    return generateTokensFromUser(ctx, actor);
  });
