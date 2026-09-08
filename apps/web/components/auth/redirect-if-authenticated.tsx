"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { readReturnToParam, safeReturnTo } from "@/lib/auth/paths";
import { useSession } from "@/lib/auth/use-session";

export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isPending || !user) return;
    router.replace(safeReturnTo(readReturnToParam()));
  }, [isPending, user, router]);

  return <>{children}</>;
}
