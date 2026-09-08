import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/theme/theme-script";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DocSync",
  description: "Offline-capable, multi-user document editor",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">
        {/* React hoists this into <head>. Deliberately not wrapped in an explicit
            <head> element — doing so stops Next injecting its own stylesheet links. */}
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
