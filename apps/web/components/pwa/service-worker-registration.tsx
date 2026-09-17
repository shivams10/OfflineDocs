"use client";

import { useEffect } from "react";

/* The version travels as a query string: public/sw.js sits outside the Next
   build and so cannot read env vars itself. */
const SW_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_SW_VERSION ?? "dev"}`;

/** Registers the worker and renders nothing. Mounted once, in the root layout. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // updateViaCache: "none" — otherwise a cached sw.js hides a new deploy for
    // the length of its max-age.
    void navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
  }, []);

  return null;
}
