"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLockup } from "@/components/brand-lockup";
import { ThemeToggle } from "@/components/theme-toggle";
import { DASHBOARD_LABELS, SESSION_LABELS } from "@/constants/labels";
import { useLogout, useSession } from "@/lib/auth/use-session";

export function SessionCard() {
  const { data: user } = useSession();
  const { mutate: signOut, isPending: signingOut } = useLogout();

  // RequireSession has already resolved the session by the time this renders.
  if (!user) return null;

  const rows = [
    { label: DASHBOARD_LABELS.name, value: user.name ?? "—" },
    { label: DASHBOARD_LABELS.email, value: user.email },
    {
      label: DASHBOARD_LABELS.memberSince,
      value: new Date(user.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <BrandLockup className="text-body" />
        <ThemeToggle />
      </header>

      <Card className="shadow-sh-1">
        <CardHeader>
          <CardTitle className="text-page-title">{DASHBOARD_LABELS.title}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          <dl className="space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <dt className="w-28 shrink-0 text-caption text-muted-foreground">
                  {row.label}
                </dt>
                <dd className="min-w-0 break-words text-ui text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>

          <Button
            variant="outline"
            onClick={() => signOut()}
            disabled={signingOut}
            className="w-full sm:w-auto"
          >
            {signingOut ? SESSION_LABELS.signingOut : SESSION_LABELS.signOut}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
