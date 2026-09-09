"use client";

import { Clock, FileText, LogOut, Settings, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_SHELL_LABELS, SESSION_LABELS } from "@/constants/labels";
import { useLogout } from "@/lib/auth/use-session";

/** Not yet wired to routes — Shared/Recent/Profile/Settings pages don't exist.
 *  Counts are placeholders until the documents list exists. */
const PRIMARY_NAV = [
  { label: APP_SHELL_LABELS.allDocuments, icon: FileText, count: null, active: true },
  { label: APP_SHELL_LABELS.sharedWithMe, icon: Users, count: null, active: false },
  { label: APP_SHELL_LABELS.recent, icon: Clock, count: null, active: false },
] as const;

const ACCOUNT_NAV = [
  { label: APP_SHELL_LABELS.profile, icon: User },
  { label: APP_SHELL_LABELS.settings, icon: Settings },
] as const;

export function AppSidenav() {
  const { mutate: signOut, isPending: signingOut } = useLogout();

  return (
    <nav className="flex w-59 shrink-0 flex-col gap-0.5 border-r border-border bg-card p-3">
      {PRIMARY_NAV.map(({ label, icon: Icon, count, active }) => (
        <div
          key={label}
          className={cn(
            "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-ui text-foreground-2",
            active && "bg-primary-soft text-primary",
          )}
        >
          <Icon className="size-4 shrink-0" />
          {label}
          {count !== null ? (
            <span className="ml-auto font-mono text-meta text-muted-foreground">
              {count}
            </span>
          ) : null}
        </div>
      ))}

      <div className="my-3 h-px bg-border" />

      <div className="px-2.5 py-1.5 text-label text-muted-foreground uppercase">
        {APP_SHELL_LABELS.account}
      </div>
      {ACCOUNT_NAV.map(({ label, icon: Icon }) => (
        <div
          key={label}
          className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-ui text-foreground-2"
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </div>
      ))}

      <button
        type="button"
        onClick={() => signOut()}
        disabled={signingOut}
        className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-ui text-foreground-2 hover:bg-accent disabled:opacity-50"
      >
        <LogOut className="size-4 shrink-0" />
        {signingOut ? SESSION_LABELS.signingOut : SESSION_LABELS.signOut}
      </button>

      <div className="flex-1" />

      <div className="rounded-lg bg-secondary p-3">
        <div className="text-ui font-semibold">{APP_SHELL_LABELS.offlineTitle}</div>
        <p className="mt-1 text-caption text-muted-foreground">
          {APP_SHELL_LABELS.offlineBody}
        </p>
      </div>
    </nav>
  );
}
