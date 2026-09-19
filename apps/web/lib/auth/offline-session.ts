"use client";

import type { AuthUser } from "@docsync/shared";

/**
 * The last identity `/auth/me` returned, so the app can open with no network.
 *
 * Identity only, never a credential — both tokens stay httpOnly cookies, and the
 * server re-checks session and role on every request this unlocks. It decides
 * what the UI may render, never what the user may do.
 *
 * Page-side state: read from React, never from the service worker, which has no
 * access to localStorage.
 */

const STORAGE_KEY = "docsync:last-session";

export function rememberSession(user: AuthUser | null): void {
  try {
    if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Blocked storage: the app still works online, and offline it falls back to
    // the sign-in screen. Not worth failing a login over.
  }
}

export function readRememberedSession(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    // Guards a shape change or a hand-edited value.
    return typeof parsed?.id === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function forgetSession(): void {
  rememberSession(null);
}
