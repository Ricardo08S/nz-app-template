import { TRPCError } from "@trpc/server";
import { generateTokensFromUser } from "../common.js";
import { env } from "../env.js";
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
  group_id: string;
  group_name: string;
}

interface OIDCUserInfo {
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
    const configUrl = `${env.OIDC_ISSUER}/.well-known/openid-configuration`;
    const response = await axios.get<OIDCConfiguration>(configUrl);
    oidcConfigCache = response.data;
    return oidcConfigCache;
  } catch (error: any) {
    console.error(
      "Failed to fetch OIDC configuration:",
      error.response?.data || error.message,
    );
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
    const config = await getOIDCConfiguration();
    const state: OIDCState = {
      direct: env.OIDC_DIRECT_URI,
      redirectUrl: input.redirectUrl,
    };

    const params = new URLSearchParams({
      client_id: env.OIDC_CLIENT_ID,
      redirect_uri: env.OIDC_REDIRECT_URI,
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
      const config = await getOIDCConfiguration();

      // Exchange code for tokens
      const tokenResponse = await axios
        .post<OIDCTokenResponse>(
          config.token_endpoint,
          new URLSearchParams({
            grant_type: "authorization_code",
            code: input.code,
            redirect_uri: env.OIDC_REDIRECT_URI,
            client_id: env.OIDC_CLIENT_ID,
            client_secret: env.OIDC_CLIENT_SECRET,
          }),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          },
        )
        .catch((error: any) => {
          console.error(
            "Token exchange failed:",
            error.response?.data || error.message,
          );
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
        .catch((error: any) => {
          console.error(
            "User info fetch failed:",
            error.response?.data || error.message,
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch user info",
          });
        });

      const userInfo = userInfoResponse.data;
      const userInfoJson = userInfo as unknown as JsonValue;

      log.info(`oidc:user-info`, {
        userInfo: userInfoJson,
      });

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
            oidc_issuer: env.OIDC_ISSUER, // Store OIDC issuer
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
            oidc_issuer: env.OIDC_ISSUER, // Store OIDC issuer
            oidc_userInfo: userInfoJson,
            oidc_sub,
          },
        });
      }

      // Generate JWT tokens using existing auth system
      const appTokens = await generateTokensFromUser(ctx, user);

      log.info(`trpc.oidc.login`, { username } as unknown as JsonValue);

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
  const config = await getOIDCConfiguration();
  const logoutUrl =
    config.end_session_endpoint ||
    `${env.OIDC_ISSUER}/protocol/openid-connect/logout`;
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
