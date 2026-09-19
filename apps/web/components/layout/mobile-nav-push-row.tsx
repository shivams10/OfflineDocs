"use client";

import { canShowPushToggle, PushToggleButton } from "@/components/push-toggle";
import { APP_SHELL_LABELS } from "@/constants/labels";
import { usePush } from "@/lib/push/use-push";

/**
 * The notifications row in the mobile drawer. The top bar's toggle is desktop-only,
 * so without this a phone has no way to opt in. Where push cannot work the whole row
 * is hidden, not just the button, so no label is left pointing at nothing.
 */
export function MobileNavPushRow() {
  const push = usePush();

  if (!canShowPushToggle(push.status)) return null;

  return (
    <div className="flex h-12 items-center gap-2.5 rounded-md px-2.5 text-ui text-foreground-2">
      <span className="flex-1">{APP_SHELL_LABELS.notifications}</span>
      <PushToggleButton push={push} />
    </div>
  );
}
