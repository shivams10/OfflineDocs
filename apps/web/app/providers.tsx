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
