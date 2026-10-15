import { TRPCError } from "@trpc/server";
import { generateTokensFromUser } from "../common.js";
import { bcrypt, z } from "../lib.js";
import { t } from "../trpc.js";

const invalidCredentialsError = new TRPCError({
  code: "UNAUTHORIZED",
  message: `Invalid credentials`,
});
export const login = t.procedure
  .input(
    z.object({
      username: z.string().nonempty(),
      password: z.string().nonempty(),
    }),
  )
  .mutation(async ({ ctx, ctx: { db, log }, input }) => {
    const user = await db.user.findUnique({
      where: {
        username: input.username,
      },
    });
    if (!user) {
      throw invalidCredentialsError;
    }
    const compareResult = bcrypt.compareSync(input.password, user.passwordHash);
    if (!compareResult) {
      throw invalidCredentialsError;
    }

    const tokens = await generateTokensFromUser(ctx, user);

    log.info(`trpc.login`, { tokens });

    return tokens;
  });
