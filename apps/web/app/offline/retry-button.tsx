"use client";

import { Button } from "@/components/ui/button";
import { OFFLINE_PAGE_LABELS } from "@/constants/labels";
import { ROUTES } from "@/constants/routes";

/* Same-origin paths only — `from` comes off the URL, where anyone can put
   anything. Both slashes are rejected after the first: browsers read "/\" as a
   protocol-relative URL just like "//", which would leave the site. */
function retryTarget(from: string | null) {
  if (!from?.startsWith("/")) return ROUTES.dashboard;
  if (from[1] === "/" || from[1] === "\\") return ROUTES.dashboard;
  return from;
}

/** A full load rather than a router push: the RSC fetch behind client navigation
    is exactly what fails offline. */
export function RetryButton() {
  const retry = () => {
    const from = new URLSearchParams(window.location.search).get("from");
    window.location.assign(retryTarget(from));
  };

  return <Button onClick={retry}>{OFFLINE_PAGE_LABELS.retry}</Button>;
}
