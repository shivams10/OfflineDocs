"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { SessionPending } from "@/components/auth/session-pending";
import { SESSION_LABELS } from "@/constants/labels";
import { ROUTES } from "@/constants/routes";
import { fetchSession } from "@/lib/api/auth";
import { safeReturnTo } from "@/lib/auth/paths";
import { SESSION_QUERY_KEY } from "@/lib/auth/use-session";

export function CallbackClient({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const handled = useRef(false);

  useEffect(() => {
    // Strict Mode runs effects twice in development; without this the redirect fires twice.
    if (handled.current) return;
    handled.current = true;

    void (async () => {
      try {
        const user = await fetchSession();
        queryClient.setQueryData(SESSION_QUERY_KEY, user);
        // `replace`, not `push`, so Back does not return to this throwaway page.
        router.replace(
          user ? safeReturnTo(returnTo) : `${ROUTES.login}?error=login_failed`,
        );
      } catch {
        router.replace(`${ROUTES.login}?error=login_failed`);
      }
    })();
  }, [returnTo, router, queryClient]);

  return <SessionPending label={SESSION_LABELS.finishingSignIn} />;
}
