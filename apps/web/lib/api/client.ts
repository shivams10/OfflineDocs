import { API } from "@/constants/routes";
import { API_ERROR_CODES } from "@/constants/errors";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:3000";

/** Deliberately readable (not httpOnly) so this code can echo it back. */
const CSRF_COOKIE = "docsync_csrf";
const CSRF_HEADER = "X-CSRF-Token";

/** Mirrors the server's own list in `middleware/csrf.ts`. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function hasSessionHint(): boolean {
  return readCookie(CSRF_COOKIE) !== null;
}

function buildHeaders(method: string, existing?: HeadersInit): Headers {
  const headers = new Headers(existing);
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers.set(CSRF_HEADER, csrf);
  }
  return headers;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);

  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: { code?: string; message?: string } }).error;
    if (err && typeof err === "object") {
      return new ApiError(
        response.status,
        err.code ?? "unknown_error",
        err.message ?? response.statusText,
      );
    }
  }
  return new ApiError(response.status, "unknown_error", response.statusText);
}

let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(apiUrl(API.refresh), {
      method: "POST",
      credentials: "include",
      headers: buildHeaders("POST"),
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

type ApiFetchOptions = Omit<RequestInit, "credentials">;

async function rawFetch(path: string, options: ApiFetchOptions): Promise<Response> {
  const method = options.method ?? "GET";
  return fetch(apiUrl(path), {
    ...options,
    method,
    credentials: "include",
    headers: buildHeaders(method, options.headers),
  });
}

/**
 * Performs a request and, on a 401 caused by an expired access token, refreshes once and
 * replays it. Anything still failing is thrown as an `ApiError` carrying the server's
 * stable `code`.
 */
export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  let response = await rawFetch(path, options);

  if (response.status === 401) {
    const error = await toApiError(response.clone());

    const worthRefreshing =
      error.code === API_ERROR_CODES.tokenExpired ||
      (error.code === API_ERROR_CODES.unauthorized && hasSessionHint());

    if (worthRefreshing && (await refreshSession())) {
      response = await rawFetch(path, options);
    }
  }

  if (!response.ok) throw await toApiError(response);
  return response;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  return response.json() as Promise<T>;
}

/** For endpoints that answer `204 No Content`. */
export async function apiPost(path: string): Promise<void> {
  await apiFetch(path, { method: "POST" });
}
