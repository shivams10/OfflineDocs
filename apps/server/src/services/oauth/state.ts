import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { OAUTH_STATE_TTL_SECONDS, env } from "../../config/env.js";
import { AppError } from "../../lib/http-error.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);
const STATE_AUDIENCE = "docsync-oauth-state";

const statePayloadSchema = z.object({
  nonce: z.string().min(1),
  returnTo: z.string().default("/"),
});

export type OAuthState = z.infer<typeof statePayloadSchema>;

export function sanitiseReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}


export async function createState(returnTo: string | undefined): Promise<string> {
  return new SignJWT({
    nonce: randomBytes(16).toString("base64url"),
    returnTo: sanitiseReturnTo(returnTo),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(STATE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_STATE_TTL_SECONDS}s`)
    .sign(secret);
}

export async function readState(token: string): Promise<OAuthState> {
  try {
    const { payload } = await jwtVerify(token, secret, { audience: STATE_AUDIENCE });
    return statePayloadSchema.parse(payload);
  } catch {
    throw new AppError(400, "invalid_oauth_state", "Sign-in request expired or was tampered with");
  }
}
