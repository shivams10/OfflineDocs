import { ROUTES } from "@/constants/routes";

export function safeReturnTo(
  value: string | null | undefined,
  fallback: string = ROUTES.dashboard,
): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  return value;
}

export function currentPathWithQuery(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return `${window.location.pathname}${window.location.search}`;
}

export function readReturnToParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("returnTo");
}

export function loginUrlFor(returnTo: string): string {
  if (returnTo === ROUTES.dashboard) return ROUTES.login;
  return `${ROUTES.login}?returnTo=${encodeURIComponent(returnTo)}`;
}
