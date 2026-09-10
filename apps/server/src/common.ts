import { TRPCError } from "@trpc/server";
import type { Context } from "./context";
import { env } from "./env";
import { bcrypt, jwt, z, type SignOptions } from "./lib";
import { jwtPayloadV, type JWTPayload } from "./shared/jwt";
import type { User } from "./zenstack/models";

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
    // env value is a plain string; jsonwebtoken narrows to a template-literal
    // union it can't verify statically, so cast to that exact field's type.
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
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

export const buildRefreshToken = async (ctx: Context, userId: string) => {
  const { db } = ctx;
  const refreshToken = await db.refreshToken.create({
    data: {
      userId,
      revoked: false,
    },
  });
  const token = jwt.sign({ id: refreshToken.id }, env.JWT_REFRESH_KEY, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
  });
  return token;
};

export const verifyRefreshToken = (token: string) => {
  const payload = jwt.verify(token, env.JWT_REFRESH_KEY);
  const refreshTokenId = z.object({ id: z.string().nonempty() }).parse(payload);
  return refreshTokenId;
};

const SALT_ROUNDS = 12;

export const hashPassword = (password: string): string => {
  return bcrypt.hashSync(password, SALT_ROUNDS);
};

/** oidc_userInfo is untyped Json - narrow the one field we actually use. */
export const oidcPicture = (userInfo: unknown): string | undefined => {
  if (
    typeof userInfo === "object" &&
    userInfo !== null &&
    "picture" in userInfo &&
    typeof userInfo.picture === "string"
  ) {
    return userInfo.picture;
  }
  return undefined;
};

// Was `new Set(...a, ...b)` - Set's constructor takes one iterable, not
// variadic args, so every element past the first became a stray extra
// constructor arg (silently ignored) and a lone string got split into
// characters. Wrap the spreads in an array so both lists actually merge.
export const mergePermissions = (a: string[], b: string[]): string[] => [
  ...new Set([...a, ...b]),
];

export const generateTokensFromUser = async (ctx: Context, user: User) => {
  const rolePermissions = await ctx.db.rolePermission.findUnique({
    where: {
      role: user.role,
    },
  });
  const accessToken = buildAccessToken({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    email: user.email ?? undefined,
    image: oidcPicture(user.oidc_userInfo),
    permissions: mergePermissions(user.permissions, rolePermissions?.permissions ?? []),
  });

  const refreshToken = await buildRefreshToken(ctx, user.id);

  return { accessToken, refreshToken };
};
