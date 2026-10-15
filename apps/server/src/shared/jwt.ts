import { z } from "./index.js";

export const jwtPayloadV = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  email: z.string().optional(),
  image: z.string().optional(),
  role: z.enum(["ADMIN", "USER"]),
  impersonation: z.string().optional(),
});
export type JWTPayload = z.infer<typeof jwtPayloadV>;

export type MeResponse = JWTPayload;
