import { TRPCError } from "@trpc/server";
import { generateTokensFromUser } from "../common.js";
import { env } from "../env.js";
import { type OidcSettings } from "../env-schema.js";
import { axios, type JsonValue, z } from "../lib.js";
import { t } from "../trpc.js";
import { Role } from "../zenstack/models.js";

interface OIDCTokenResponse {
  access_token: string;
  token_type: string;
  id_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface SsoGroup {
  [key: string]: string;
  group_id: string;
  group_name: string;
}

interface OIDCUserInfo {
  [key: string]: JsonValue | null | undefined;
  sub: string;
  name?: string;
  role?: string[];
  group?: SsoGroup[];
  email?: string;
  gender?: string;
  locale?: string;
  locked?: string | null;
  reg_id?: string;
  enabled?: string;
  picture?: string;
  nickname?: string | null;
  zoneinfo?: string;
  birthdate?: string;
  suspended?: string | null;
  updated_at?: string;
  has_suspended?: string;
  email_verified?: string;
  alternate_email?: string;
  must_change_pwd?: string;
  preferred_username?: string;
  alternate_email_verified?: string;
}

interface OIDCConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint?: string;
  issuer: string;
}

interface OIDCState {
  direct?: string;
  redirectUrl?: string;
}

/** Prefer the provider's own error body over axios's generic message. */
const describeError = (error: unknown): unknown =>
  axios.isAxiosError(error) ? (error.response?.data ?? error.message) : error;

/** env.oidc is the single source of truth for whether OIDC is configured. */
const requireOidcSettings = (): OidcSettings => {
  if (!env.oidc) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "OIDC login is not configured on this server.",
    });
  }
  return env.oidc;
};

// Cache for OIDC configuration to avoid repeated requests
let oidcConfigCache: OIDCConfiguration | null = null;

/**
 * Fetch OIDC configuration from .well-known endpoint
 */
async function getOIDCConfiguration(): Promise<OIDCConfiguration> {
  if (oidcConfigCache) {
    return oidcConfigCache;
  }

  try {
    const configUrl = `${requireOidcSettings().issuer}/.well-known/openid-configuration`;
    const response = await axios.get<OIDCConfiguration>(configUrl);
    oidcConfigCache = response.data;
    return oidcConfigCache;
  } catch (error) {
    console.error("Failed to fetch OIDC configuration:", describeError(error));
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch OIDC provider configuration",
    });
  }
}

/**
 * Initiate OIDC login flow
 * Returns the authorization URL that the client should redirect to
 */
export const oidcInitiateLogin = t.procedure
  .input(
    z.object({
      redirectUrl: z.string().optional(),
    }),
  )
  .query(async ({ input }) => {
    const oidc = requireOidcSettings();
    const config = await getOIDCConfiguration();
    const state: OIDCState = {
      direct: env.OIDC_DIRECT_URI,
      redirectUrl: input.redirectUrl,
    };

    const params = new URLSearchParams({
      client_id: oidc.clientId,
      redirect_uri: oidc.redirectUri,
      response_type: "code",
      scope: "openid profile email role group",
      state: JSON.stringify(state),
    });

    const authUrl = `${config.authorization_endpoint}?${params}`;

    return {
      authUrl,
    };
  });

/**
 * Handle OIDC callback after user authenticates with provider
 * Exchanges authorization code for tokens and creates/updates user
 */
export const oidcHandleCallback = t.procedure
  .input(
    z.object({
      code: z.string(),
    }),
  )
  .mutation(async ({ ctx, ctx: { db, log }, input }) => {
    try {
      const oidc = requireOidcSettings();
      const config = await getOIDCConfiguration();

      // Exchange code for tokens
      const tokenResponse = await axios
        .post<OIDCTokenResponse>(
          config.token_endpoint,
          new URLSearchParams({
            grant_type: "authorization_code",
            code: input.code,
            redirect_uri: oidc.redirectUri,
            client_id: oidc.clientId,
            client_secret: oidc.clientSecret,
          }),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          },
        )
        .catch((error: unknown) => {
          console.error("Token exchange failed:", describeError(error));
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to exchange code for token",
          });
        });

      const tokens = tokenResponse.data;

      // Fetch user info
      const userInfoResponse = await axios
        .get<OIDCUserInfo>(config.userinfo_endpoint, {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        })
        .catch((error: unknown) => {
          console.error("User info fetch failed:", describeError(error));
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch user info",
          });
        });

      const userInfo = userInfoResponse.data;
      // OIDCUserInfo carries an index signature (above) so this is a direct,
      // structurally valid cast - not a type-system escape hatch.
      const userInfoJson = userInfo as JsonValue;

      // Log only the identifier, not the full PII blob - logs go to
      // stdout/Loki, which far more people can read than the DB.
      log.info(`oidc:user-info`, { sub: userInfo.sub });

      // Create or update user in database
      const oidc_sub = userInfo.sub;
      const username = userInfo.preferred_username ?? oidc_sub;
      const name = userInfo.name ?? username;
      const email = userInfo.email;
      const role = Role.USER;

      let user = await db.user.findUnique({
        where: {
          oidc_sub,
        },
      });

      if (!user) {
        // Create new user
        user = await db.user.create({
          data: {
            username,
            name,
            email,
            passwordHash: "", // OIDC users don't need password
            role,
            oidc_issuer: oidc.issuer, // Store OIDC issuer
            oidc_userInfo: userInfoJson,
            oidc_sub,
          },
        });
      } else {
        // Update existing user info
        user = await db.user.update({
          where: { id: user.id },
          data: {
            username,
            name,
            email,
            oidc_issuer: oidc.issuer, // Store OIDC issuer
            oidc_userInfo: userInfoJson,
            oidc_sub,
          },
        });
      }

      // Generate JWT tokens using existing auth system
      const appTokens = await generateTokensFromUser(ctx, user);

      log.info(`trpc.oidc.login`, { username });

      // Return tokens and user info
      return {
        accessToken: appTokens.accessToken,
        refreshToken: appTokens.refreshToken,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("OIDC callback error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error during OIDC callback",
      });
    }
  });

/**
 * Get OIDC logout URL
 * Returns the URL to logout from the OIDC provider
 */
export const oidcLogout = t.procedure.query(async () => {
  const oidc = requireOidcSettings();
  const config = await getOIDCConfiguration();
  const logoutUrl =
    config.end_session_endpoint || `${oidc.issuer}/protocol/openid-connect/logout`;
  return { logoutUrl };
});

/**
 * Get user info from OIDC for the authenticated user
 * Returns the userInfo field stored in the User model
 */
export const oidcUserInfo = t.procedure.query(async ({ ctx: { db, user } }) => {
  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Not authenticated",
    });
  }

  const userData = await db.user.findUnique({
    where: { id: user.id },
    select: { oidc_userInfo: true },
  });

  if (!userData) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "User not found",
    });
  }

  return userData.oidc_userInfo;
});
