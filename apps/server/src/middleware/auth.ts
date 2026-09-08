import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { ACCESS_TOKEN_COOKIE } from "../lib/cookies.js";
import { AppError } from "../lib/http-error.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by `requireAuth`. Absent on unauthenticated routes. */
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Gate for every authenticated route.
 *
 * The access token arrives as an httpOnly cookie, so page JavaScript can never read it —
 * an XSS bug cannot exfiltrate the credential. The cost of cookie transport is CSRF
 * exposure, which `requireCsrfToken` handles for every state-changing method.
 *
 * This only proves *who* the caller is. Per-document authorisation is a separate concern
 * handled by `requireRole` (techspec 8), which runs after this.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
    if (!token) {
      throw AppError.unauthorized("Not signed in");
    }

    const claims = await verifyAccessToken(token);
    req.user = { id: claims.sub, email: claims.email };
    next();
  } catch (error) {
    next(error);
  }
}

export function getAuthenticatedUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new Error("getAuthenticatedUser called on a route without requireAuth");
  }
  return req.user;
}
