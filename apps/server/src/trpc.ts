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
// Server-side enforcement of the ADMIN role — the (admin) route group in web
// only hides the UI, it never restricted the underlying tRPC calls. Any
// procedure meant to be admin-only must use this, not tuser.
export const tadmin = tuser.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "ADMIN") {
    throw forbiddenError;
  }
  return next({ ctx });
});
