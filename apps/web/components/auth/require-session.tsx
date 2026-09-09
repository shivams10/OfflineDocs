"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SessionPending } from "@/components/auth/session-pending";
import { NETWORK_ERROR_MESSAGE } from "@/constants/errors";
import { SESSION_LABELS } from "@/constants/labels";
import { ROUTES } from "@/constants/routes";
import { currentPathWithQuery, loginUrlFor } from "@/lib/auth/paths";
import { useSession } from "@/lib/auth/use-session";

export function RequireSession({ children }: { children: ReactNode }) {
  const { data: user, isPending, isError, refetch } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const signedOut = !isPending && !isError && !user;

  useEffect(() => {
    if (!signedOut) return;
    router.replace(loginUrlFor(currentPathWithQuery(pathname ?? ROUTES.dashboard)));
  }, [signedOut, router, pathname]);

  if (isPending) return <SessionPending label={SESSION_LABELS.checking} />;

  if (isError) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div role="alert" className="max-w-sm space-y-3 text-center">
          <h1 className="text-page-title">{SESSION_LABELS.unreachableTitle}</h1>
          <p className="text-ui text-muted-foreground">{NETWORK_ERROR_MESSAGE}</p>
          <Button onClick={() => void refetch()}>{SESSION_LABELS.retry}</Button>
        </div>
      </div>
    );
  }

  if (!user) return <SessionPending label={SESSION_LABELS.redirecting} />;

  return <>{children}</>;
}
