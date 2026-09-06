import { SchemaType as $Schema } from "../zenstack/schema.js";
import { z } from ".";
import { Role, type AuthInfo } from "../zenstack/models";

export const jwtPayloadV = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  email: z.string().optional(),
  image: z.string().optional(),
  role: z.enum(Role),
  permissions: z.string().array(),
});
export type JWTPayload = z.infer<typeof jwtPayloadV>;

export type MeResponse = JWTPayload;

type TypeEquality<T, U> = keyof T extends keyof U
  ? keyof U extends keyof T
    ? true
    : false
  : false;
type A = Pick<AuthInfo, keyof $Schema["typeDefs"]["AuthInfo"]["fields"]>;
const _authAssert1: TypeEquality<JWTPayload, A> = true;
const _authAssert2: TypeEquality<A, JWTPayload> = true;
