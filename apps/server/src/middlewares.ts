import { forbiddenError } from "./common.js";
import { JWTPayload } from "./shared/jwt.js";
import { t } from "./trpc.js";
import { Role } from "./zenstack/models.js";

export const checkUser = (fn: (user: JWTPayload) => boolean) => {
  return t.middleware(({ ctx: { user }, next }) => {
    if (!user) {
      throw forbiddenError;
    }
    const valid = fn(user);
    if (!valid) {
      throw forbiddenError;
    }
    return next();
  });
};

export const checkRole = (role: Role) => {
  return t.middleware(({ ctx: { user }, next }) => {
    if (!user) {
      throw forbiddenError;
    }
    const valid = user.role === role;
    if (!valid) {
      throw forbiddenError;
    }
    return next();
  });
};
