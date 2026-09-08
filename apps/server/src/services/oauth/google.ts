import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/http-error.js";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const SCOPE = "openid email profile";

export interface GoogleProfile {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

export function getGoogleCredentials(): GoogleCredentials {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(
      503,
      "provider_not_configured",
      "Google sign-in is not configured on this server",
    );
  }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export function googleRedirectUri(): string {
  return `${env.SERVER_ORIGIN}/auth/google/callback`;
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const { clientId } = getGoogleCredentials();

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeGoogleCode(code: string): Promise<string> {
  const { clientId, clientSecret } = getGoogleCredentials();

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  const payload: unknown = await response.json().catch(() => null);
  const parsed = z.object({ access_token: z.string().min(1) }).safeParse(payload);

  // Both are checked: OAuth providers sometimes answer with HTTP 200 and an error body,
  // so the status code alone is not enough to trust the response.
  if (!response.ok || !parsed.success) {
    throw new AppError(
      502,
      "oauth_exchange_failed",
      "Could not exchange the authorization code with Google",
    );
  }
  return parsed.data.access_token;
}

const googleProfileSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean().default(false),
  name: z.string().nullish(),
  picture: z.string().nullish(),
});

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch(USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "docsync",
    },
  });

  if (!response.ok) {
    throw new AppError(502, "oauth_profile_failed", "Could not read your Google profile");
  }

  const profile = googleProfileSchema.parse(await response.json());
  return {
    providerUserId: profile.sub,
    email: profile.email,
    emailVerified: profile.email_verified,
    name: profile.name ?? null,
    avatarUrl: profile.picture ?? null,
  };
}
