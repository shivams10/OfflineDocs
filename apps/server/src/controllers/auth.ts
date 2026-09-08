import type { Request, Response } from "express";
import type { AuthUser, MeResponse } from "@docsync/shared";
import { env } from "../config/env.js";
import { AppError } from "../lib/http-error.js";
import {
  OAUTH_STATE_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearOAuthStateCookie,
  clearSessionCookies,
  setAccessTokenCookie,
  setCsrfCookie,
  setOAuthStateCookie,
  setRefreshTokenCookie,
} from "../lib/cookies.js";
import { getAuthenticatedUser } from "../middleware/auth.js";
import { revokeSession, rotateSession, type IssuedSession } from "../services/auth.js";
import { getUserProfile, type UserProfile } from "../services/users.js";
import { completeGoogleLogin, startGoogleLogin } from "../services/oauth/login.js";
import type { CallbackQuery, StartQuery } from "../validators/auth.js";

function setSessionCookies(res: Response, session: IssuedSession): void {
  setAccessTokenCookie(res, session.accessToken);
  setRefreshTokenCookie(res, session.refreshToken);
  setCsrfCookie(res, session.csrfToken);
}

function toAuthUser(user: UserProfile): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

function redirectWithError(res: Response, code: string): void {
  clearOAuthStateCookie(res);
  const url = new URL("/login", env.WEB_ORIGIN);
  url.searchParams.set("error", code);
  res.redirect(url.toString());
}

export async function startLogin(req: Request, res: Response): Promise<void> {
  const { returnTo } = req.query as unknown as StartQuery;

  const { state, authorizeUrl } = await startGoogleLogin(returnTo);

  setOAuthStateCookie(res, state);
  res.redirect(authorizeUrl);
}

export async function handleCallback(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as CallbackQuery;

  if (query.error) {
    redirectWithError(res, query.error === "access_denied" ? "access_denied" : "provider_error");
    return;
  }

  const stateCookie = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
  if (!query.code || !query.state || !stateCookie) {
    redirectWithError(res, "invalid_oauth_state");
    return;
  }

  try {
    const { session, returnTo } = await completeGoogleLogin({
      code: query.code,
      state: query.state,
      stateCookie,
    });

    clearOAuthStateCookie(res);
    setSessionCookies(res, session);

    const destination = new URL("/auth/callback", env.WEB_ORIGIN);
    destination.searchParams.set("returnTo", returnTo);
    res.redirect(destination.toString());
  } catch (error) {
    if (!(error instanceof AppError)) {
      console.error("OAuth callback failed:", error);
    }
    redirectWithError(res, error instanceof AppError ? error.code : "login_failed");
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const presented = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
  if (!presented) {
    throw AppError.unauthorized("No refresh token provided");
  }

  try {
    setSessionCookies(res, await rotateSession(presented));
    res.status(204).send();
  } catch (error) {
    clearSessionCookies(res);
    throw error;
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  const presented = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
  if (presented) {
    await revokeSession(presented);
  }
  clearSessionCookies(res);
  res.status(204).send();
}

export async function me(req: Request, res: Response<MeResponse>): Promise<void> {
  const { id } = getAuthenticatedUser(req);
  res.json({ user: toAuthUser(await getUserProfile(id)) });
}
