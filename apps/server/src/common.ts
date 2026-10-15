import { TRPCError } from "@trpc/server";
import type { Context } from "./context.js";
import { env } from "./env.js";
import { bcrypt, jwt, z } from "./lib.js";
import { jwtPayloadV, type JWTPayload } from "./shared/jwt.js";
import type { User } from "./zenstack/models.js";

export const unauthorizedError = new TRPCError({
  code: "UNAUTHORIZED",
  message: `You are not authorized.`,
});

export const forbiddenError = new TRPCError({
  code: "FORBIDDEN",
  message: `Access forbidden.`,
});

export const buildAccessToken = (payload: JWTPayload): string => {
  const token = jwt.sign(payload, env.JWT_ACCESS_KEY, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
  });
  return token;
};

export const verifyAccessToken = (token: string): JWTPayload | null => {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_KEY);
    const jwtObject = jwtPayloadV.parse(payload);
    return jwtObject;
  } catch (error) {
    console.error(error);
    return null;
  }
};

// `impersonation` is the actor (admin) user id, carried as a signed claim on
// the refresh JWT, so refresh can re-issue impersonation tokens without a
// schema change.
export const buildRefreshToken = async (
  ctx: Context,
  userId: string,
  impersonation?: string,
) => {
  const { db } = ctx;
  const refreshToken = await db.refreshToken.create({
    data: {
      userId,
      revoked: false,
    },
  });
  const token = jwt.sign(
    { id: refreshToken.id, ...(impersonation ? { impersonation } : {}) },
    env.JWT_REFRESH_KEY,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as any },
  );
  return token;
};

export const verifyRefreshToken = (token: string) => {
  const payload = jwt.verify(token, env.JWT_REFRESH_KEY);
  return z
    .object({
      id: z.string().nonempty(),
      impersonation: z.string().optional(),
    })
    .parse(payload);
};

const SALT_ROUNDS = 12;

export const hashPassword = (password: string): string => {
  return bcrypt.hashSync(password, SALT_ROUNDS);
};

export const generateTokensFromUser = async (
  ctx: Context,
  user: User,
  impersonation?: string,
) => {
  const accessToken = buildAccessToken({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    email: user.email ?? undefined,
    image: (user.oidc_userInfo as any)?.picture ?? undefined,
    ...(impersonation ? { impersonation } : {}),
  });

  const refreshToken = await buildRefreshToken(ctx, user.id, impersonation);

  return { accessToken, refreshToken };
};
