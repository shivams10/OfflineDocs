/**
 * Errors thrown as `AppError` are the ones we intend the client to see. Anything else
 * reaching the error handler is treated as an unexpected fault and reported as a generic
 * 500, so internal details never leak into a response body.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "bad_request", message, details);
  }

  static unauthorized(message = "Authentication required") {
    return new AppError(401, "unauthorized", message);
  }

  static forbidden(message = "You do not have access to this resource") {
    return new AppError(403, "forbidden", message);
  }

  static notFound(message = "Resource not found") {
    return new AppError(404, "not_found", message);
  }
}
