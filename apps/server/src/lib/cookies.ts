import type { CookieOptions, Response } from "express";
import {
  OAUTH_STATE_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  isProduction,
} from "../config/env.js";

export const ACCESS_TOKEN_COOKIE = "docsync_access";
export const REFRESH_TOKEN_COOKIE = "docsync_refresh";
export const CSRF_COOKIE = "docsync_csrf";
export const OAUTH_STATE_COOKIE = "docsync_oauth_state";

export const CSRF_HEADER = "x-csrf-token";

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
  };
}

export function setAccessTokenCookie(res: Response, token: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...baseCookieOptions(),
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...baseCookieOptions(),

    path: "/auth",
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}


export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    ...baseCookieOptions(),
    httpOnly: false,
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function setOAuthStateCookie(res: Response, value: string): void {
  res.cookie(OAUTH_STATE_COOKIE, value, {
    ...baseCookieOptions(),
    path: "/auth",
    maxAge: OAUTH_STATE_TTL_SECONDS * 1000,
  });
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, { ...baseCookieOptions(), path: "/auth" });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...baseCookieOptions(), path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...baseCookieOptions(), path: "/auth" });
  res.clearCookie(CSRF_COOKIE, { ...baseCookieOptions(), httpOnly: false, path: "/" });
}
