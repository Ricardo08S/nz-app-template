import { z } from "./lib.js";

/** process.env values are always strings, so z.boolean() would reject "true". */
const envBool = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === "") {
        return defaultValue;
      }
      return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
    });

export const envSchema = z.object({
  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ENV: z.string().min(1),
  // No default: it feeds the bucket name, database name and every deploy domain.
  APP_NAME: z.string().min(1),
  VERBOSE: envBool(false),

  // Database
  DATABASE_URL: z.url(),
  DB_POOL_SIZE: z.coerce.number().int().positive().default(10),

  // Authentication
  JWT_ACCESS_KEY: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_KEY: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),

  // Object storage (S3-compatible)
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  AWS_S3_BUCKET: z.string(),
  // Signed operations (presigned PUT, HeadObject). SigV4 binds to this host,
  // so it must be the same URL the browser will use.
  AWS_S3_ENDPOINT: z.string().optional(),
  // Anonymous reads. Garage serves these on a separate port and resolves the
  // bucket from the host, so this already includes the bucket.
  PUBLIC_S3_ENDPOINT: z.url().optional(),

  // OIDC - ships with the template but is opt-in. Leave unset to run without it.
  OIDC_ISSUER: z.url().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.url().optional(),
  OIDC_STATE: z.string().optional(),
  OIDC_DIRECT_URI: z.string().optional(),

  // Grafana Loki - opt-in. No observability stack is required to run.
  LOKI_URL: z.url().optional(),
});

export type ParsedEnv = z.infer<typeof envSchema>;

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  state: string;
}

export type Env = ParsedEnv & {
  /** Non-null only when every OIDC setting is present. */
  oidc: OidcSettings | null;
};

const buildOidcSettings = (e: ParsedEnv): OidcSettings | null => {
  const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI } = e;
  if (!OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET || !OIDC_REDIRECT_URI) {
    return null;
  }
  return {
    issuer: OIDC_ISSUER,
    clientId: OIDC_CLIENT_ID,
    clientSecret: OIDC_CLIENT_SECRET,
    redirectUri: OIDC_REDIRECT_URI,
    state: e.OIDC_STATE ?? "",
  };
};

export type ParseEnvResult = { success: true; env: Env } | { success: false; error: z.ZodError };

/** Kept free of dotenv and process.exit so tests can call it directly. */
export const parseEnv = (source: Record<string, unknown> = process.env): ParseEnvResult => {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }
  return {
    success: true,
    env: { ...parsed.data, oidc: buildOidcSettings(parsed.data) },
  };
};
