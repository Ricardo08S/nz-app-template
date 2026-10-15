import { initTRPC } from "@trpc/server";
import SuperJSON from "superjson";
import type { Context } from "./context.js";
import { unauthorizedError } from "./common.js";

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
