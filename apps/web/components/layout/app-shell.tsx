import type { ReactNode } from "react";
import { AppTopbar } from "./app-topbar";
import { AppSidenav } from "./app-sidenav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <AppTopbar />
      <div className="flex min-h-0 flex-1">
        <AppSidenav />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
