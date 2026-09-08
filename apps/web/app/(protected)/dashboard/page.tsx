import type { Metadata } from "next";
import { SessionCard } from "./session-card";

export const metadata: Metadata = { title: "Dashboard · DocSync" };

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <SessionCard />
    </main>
  );
}
