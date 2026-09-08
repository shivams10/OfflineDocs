import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DocSync",
  description: "Offline-first collaborative document editor",
};

/* Colours the browser/OS chrome when DocSync is installed as a PWA. Values are
   --light-bg and --dark-bg. These follow the OS preference, not our .dark
   class, so a user who pins a theme against their OS setting keeps the old
   colour here until we update the tag from JS. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d11" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    /* suppressHydrationWarning is required, not cosmetic: next-themes adds the
       `dark` class to <html> before React hydrates, so the class attribute no
       longer matches what the server sent. It suppresses the diff on this
       element only, not on its children. */
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
