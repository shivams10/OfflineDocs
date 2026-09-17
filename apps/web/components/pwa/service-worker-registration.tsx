"use client";

import { useServiceWorker } from "@/lib/pwa/use-service-worker";
import { UpdateBanner } from "./update-banner";

/** Registers the worker and surfaces a waiting update. Mounted once, in the
    root layout. */
export function ServiceWorkerRegistration() {
  const { updateReady, applyUpdate } = useServiceWorker();

  if (!updateReady) return null;
  return <UpdateBanner onApply={applyUpdate} />;
}
