import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../lib/http-error.js";

type RequestPart = "body" | "query" | "params";

export function validate(part: RequestPart, schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[part]);
      Object.defineProperty(req, part, { value: parsed, writable: true, configurable: true });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          AppError.badRequest(
            `Invalid request ${part}`,
            error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          ),
        );
        return;
      }
      next(error);
    }
  };
}
