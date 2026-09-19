"use client";

import { useState } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        /* Default "online" pauses every query while the browser reports offline,
           which in this app means nothing is even asked for: the session query
           never runs, so its remembered-identity fallback never fires and the
           app sits on "Checking your session…" forever. Offline reads are the
           product (§1.2) — the service worker answers them from cache, and a
           query that truly cannot be served fails fast and shows its own error.
           navigator.onLine reports an interface, not reachability, so it was
           never the right thing to gate on. */
        networkMode: "offlineFirst",
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        /* Drives the `.dark` class that globals.css keys its palette on. */
        attribute="class"
        defaultTheme="system"
        enableSystem
        /* Without this, every element animates its colour during a theme switch. */
        disableTransitionOnChange
        storageKey="docsync-theme"
      >
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
