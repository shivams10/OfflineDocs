import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/http-error.js";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound("No route matches this path"));
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  console.error("Unhandled error:", error);
  res.status(500).json({
    error: { code: "internal_error", message: "Something went wrong" },
  });
}
