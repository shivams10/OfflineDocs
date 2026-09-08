"use client";

import { ThemeProvider } from "next-themes";

/* Client-side context providers. Kept out of layout.tsx so the layout stays a
   server component; only this subtree opts into the client. Later providers
   (Y.Doc, auth, query client) belong here too. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
