import { initTRPC } from "@trpc/server";
import SuperJSON from "superjson";
import type { Context } from "./context";
import { forbiddenError, unauthorizedError } from "./common";

export const t = initTRPC.context<Context>().create({ transformer: SuperJSON });
export const tuser = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw unauthorizedError;
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
// Convenience gate for procedure-level admin checks. The real enforcement is
// the ZenStack @@allow/@@deny policies in the schema (auth().role == ADMIN) -
// those apply no matter which client hits the API. This just saves a round
// trip to the DB when a whole procedure should be admin-only up front.
export const tadmin = tuser.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "ADMIN") {
    throw forbiddenError;
  }
  return next({ ctx });
});
