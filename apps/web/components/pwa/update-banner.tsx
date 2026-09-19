"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PWA_LABELS } from "@/constants/labels";

/**
 * Offers the update; never takes it. A waiting worker stays waiting until the
 * user presses Refresh, because reloading on our own discards what they were
 * typing. Dismissing hides the banner for this page view only.
 */
export function UpdateBanner({ onApply }: { onApply: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const { updateTitle, updateBody, updateAction, updateDismiss } = PWA_LABELS;

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/25 bg-primary-soft px-4 py-2 text-caption text-primary sm:px-8"
    >
      <span className="font-medium">{updateTitle}</span>
      <span className="text-foreground-2">{updateBody}</span>

      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" onClick={onApply}>
          {updateAction}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          {updateDismiss}
        </Button>
      </div>
    </div>
  );
}
