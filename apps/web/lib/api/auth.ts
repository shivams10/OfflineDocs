import type { AuthUser, MeResponse } from "@docsync/shared";
import { API, ROUTES } from "@/constants/routes";
import { ApiError, apiGet, apiPost, apiUrl } from "./client";

export async function fetchSession(): Promise<AuthUser | null> {
  try {
    const { user } = await apiGet<MeResponse>(API.me);
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function logout(): Promise<void> {
  await apiPost(API.logout);
}

export function googleLoginUrl(returnTo: string = ROUTES.dashboard): string {
  const url = new URL(apiUrl(API.googleLogin));
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}
