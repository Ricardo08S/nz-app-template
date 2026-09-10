import type { ExpressMiddlewareOptions } from "@zenstackhq/server/express";
import { verifyAccessToken } from "./common.js";
import { authDb, db } from "./db.js";
import { type JsonObject, type trpcExpress } from "./lib.js";
import { createLog } from "./log.js";
import { s3 } from "./s3.js";
import type { JWTPayload } from "./shared/jwt.js";
import type { SchemaType } from "./zenstack/schema";

const getUserFromToken = (token: string | undefined): JWTPayload | null => {
  if (!token) {
    return null;
  }
  const jwtObject = verifyAccessToken(token);
  return jwtObject;
};

const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie"]);

const maskValue = (value: string) =>
  value.length <= 4 ? "***" : `${value.slice(0, 4)}***`;

const headersToObject = (rawHeaders: string[]) => {
  const headers: JsonObject = {};
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const key = rawHeaders[i];
    const value = rawHeaders.at(i + 1) ?? null;
    headers[key] =
      value !== null && SENSITIVE_HEADERS.has(key.toLowerCase())
        ? maskValue(value)
        : value;
  }
  return headers;
};
export const createContext = async ({
  req,
  res,
}: trpcExpress.CreateExpressContextOptions) => {
  const user = getUserFromToken(req.headers.authorization);
  const userDb = authDb.$setAuth(user ?? undefined);
  const requestHeaders = headersToObject(req.rawHeaders);
  return {
    req,
    res,
    user,
    db,
    userDb,
    s3,
    log: createLog({ requestHeaders }),
  };
};
export type Context = Awaited<ReturnType<typeof createContext>>;

export const getClient: ExpressMiddlewareOptions<SchemaType>["getClient"] = async (req) => {
  const user = getUserFromToken(req.headers.authorization);
  return authDb.$setAuth(user ?? undefined);
};
