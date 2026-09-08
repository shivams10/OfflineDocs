import type { NextFunction, Request, Response } from "express";
import { CSRF_COOKIE, CSRF_HEADER } from "../lib/cookies.js";
import { constantTimeEquals } from "../lib/crypto.js";
import { AppError } from "../lib/http-error.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireCsrfToken(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || !constantTimeEquals(cookieToken, headerToken)) {
    next(
      new AppError(
        403,
        "csrf_token_invalid",
        "Missing or invalid CSRF token. Reload the page and try again.",
      ),
    );
    return;
  }

  next();
}
