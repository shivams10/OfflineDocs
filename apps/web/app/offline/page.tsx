import type { Metadata } from "next";
import Link from "next/link";
import { CloudOff } from "lucide-react";
import { BrandLockup } from "@/components/brand-lockup";
import { buttonVariants } from "@/components/ui/button";
import { OFFLINE_PAGE_LABELS } from "@/constants/labels";
import { ROUTES } from "@/constants/routes";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Offline · DocSync" };

/* Precached by the service worker and served whenever a page has no cached
   copy, so it must render without any network call of its own. */
export default function OfflinePage() {
  const { title, body, backToDocuments } = OFFLINE_PAGE_LABELS;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-7 px-5 py-10">
      <BrandLockup className="text-body" />

      <div className="flex max-w-[420px] flex-col items-center gap-3 text-center">
        <span
          aria-hidden
          className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"
        >
          <CloudOff className="size-5" />
        </span>

        <h1 className="text-balance font-heading text-[1.25rem]/[1.3] font-semibold tracking-[-0.02em]">
          {title}
        </h1>
        <p className="text-pretty text-body/[1.6] text-foreground-2">{body}</p>
      </div>

      <div className="flex items-center gap-2.5">
        <RetryButton />
        <Link href={ROUTES.dashboard} className={buttonVariants({ variant: "outline" })}>
          {backToDocuments}
        </Link>
      </div>
    </main>
  );
}
