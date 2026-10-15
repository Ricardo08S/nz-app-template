import { tuser } from "../trpc.js";

export const me = tuser.query(async ({ ctx: { user, log, db } }) => {
  log.info(`me`);

  return user;
});
