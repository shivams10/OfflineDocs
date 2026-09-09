"use client";

import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLockup } from "@/components/brand-lockup";
import { APP_SHELL_LABELS } from "@/constants/labels";
import { useSession } from "@/lib/auth/use-session";

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  return source.slice(0, 2).toUpperCase();
}

export function AppTopbar() {
  const { data: user } = useSession();

  return (
    <header className="flex h-15 shrink-0 items-center gap-4 border-b border-border bg-card px-5.5">
      <BrandLockup />

      <div className="relative w-full max-w-85">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder={APP_SHELL_LABELS.searchPlaceholder}
          className="h-9.5 w-full rounded-lg border border-input bg-card py-2 pr-3 pl-9 text-ui placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        />
      </div>

      <div className="flex-1" />

      <Button>
        <Plus />
        {APP_SHELL_LABELS.newDocument}
      </Button>

      <ThemeToggle />

      {user ? (
        <div className="flex items-center gap-2.5 border-l border-border pl-3.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-caption font-semibold text-primary">
            {initials(user.name, user.email)}
          </span>
          <div className="hidden sm:block">
            <div className="text-ui leading-tight font-semibold">
              {user.name ?? user.email}
            </div>
            <div className="text-meta leading-tight text-muted-foreground">
              {user.email}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
