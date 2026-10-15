import { TRPCError } from "@trpc/server";
import { sleep, z } from "../lib.js";
import { t } from "../trpc.js";

export const hello = t.procedure
  .input(z.string().nullish())
  .query(async (opts) => {
    await sleep(1000);
    // throw new TRPCError({
    //   code: "INTERNAL_SERVER_ERROR",
    //   message: `Testing`,
    // });
    opts.ctx.log.info(`hello`);
    return `hello ${opts.input ?? opts.ctx.user?.username ?? "world"}`;
  });
