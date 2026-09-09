"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SessionPending } from "@/components/auth/session-pending";
import { NETWORK_ERROR_MESSAGE } from "@/constants/errors";
import { SESSION_LABELS } from "@/constants/labels";
import { ROUTES } from "@/constants/routes";
import { useSession } from "@/lib/auth/use-session";

export function HomeRedirect() {
  const { data: user, isPending, isError } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isPending || isError) return;
    router.replace(user ? ROUTES.dashboard : ROUTES.login);
  }, [isPending, isError, user, router]);

  if (isError) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div role="alert" className="max-w-sm space-y-2 text-center">
          <h1 className="text-page-title">{SESSION_LABELS.unreachableTitle}</h1>
          <p className="text-ui text-muted-foreground">{NETWORK_ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  return <SessionPending label={SESSION_LABELS.checking} />;
}
