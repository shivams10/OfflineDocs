import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { z } from "zod";
import { ACCESS_TOKEN_TTL_SECONDS, env } from "../config/env.js";
import { AppError } from "./http-error.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

const ISSUER = "docsync";
const AUDIENCE = "docsync-api";


const accessTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
});

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return accessTokenClaimsSchema.parse(payload);
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      throw new AppError(401, "token_expired", "Access token has expired");
    }
    throw AppError.unauthorized("Invalid access token");
  }
}
