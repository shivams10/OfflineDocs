"use client";

import { useCallback, useEffect, useState } from "react";
import {
  currentSubscription,
  disablePush,
  enablePush,
  fetchVapidPublicKey,
  isPushSupported,
} from "./subscribe";

export type PushStatus =
  /** Still working out what this browser and this server can do. */
  | "checking"
  /** No service worker / PushManager, or the server has no VAPID keys configured. */
  | "unavailable"
  /** Supported and off. */
  | "off"
  | "enabling"
  | "on"
  /** The user said no at the OS prompt — only they can undo this, in browser settings. */
  | "blocked"
  | "error";

export interface PushState {
  status: PushStatus;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

/**
 * Notification opt-in for the signed-in user.
 *
 * Deliberately never prompts on its own. A permission dialog fired on page load is
 * the fastest way to get permanently denied, and a denial is not something the app
 * can reverse — so the prompt only ever follows an explicit click.
 */
export function usePush(): PushState {
  const [status, setStatus] = useState<PushStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!isPushSupported()) {
        if (!cancelled) setStatus("unavailable");
        return;
      }

      // A server with no VAPID keys means push is off, not broken — hide the
      // control rather than offer something that cannot work.
      const publicKey = await fetchVapidPublicKey().catch(() => null);
      if (cancelled) return;
      if (!publicKey) {
        setStatus("unavailable");
        return;
      }

      if (Notification.permission === "denied") {
        setStatus("blocked");
        return;
      }

      // Permission alone isn't "on": it survives an unsubscribe, so the live
      // subscription is what actually decides.
      const subscription = await currentSubscription();
      if (!cancelled) setStatus(subscription ? "on" : "off");
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setStatus("enabling");
    try {
      await enablePush();
      setStatus("on");
    } catch (error) {
      setStatus(
        error instanceof Error && error.message === "permission_denied"
          ? "blocked"
          : "error",
      );
    }
  }, []);

  const disable = useCallback(async () => {
    try {
      await disablePush();
      setStatus("off");
    } catch {
      setStatus("error");
    }
  }, []);

  return { status, enable, disable };
}
