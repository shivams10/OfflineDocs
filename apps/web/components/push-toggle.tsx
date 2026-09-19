"use client";

import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PUSH_LABELS } from "@/constants/labels";
import { usePush, type PushState, type PushStatus } from "@/lib/push/use-push";

/**
 * Whether there is a control to show at all. An unsupported browser or a server with
 * no VAPID keys gets nothing, rather than a disabled button the user cannot act on.
 */
export function canShowPushToggle(status: PushStatus): boolean {
  return status !== "checking" && status !== "unavailable";
}

/**
 * The button alone, driven by push state the caller already holds — so a surface that
 * wraps it in its own row (the mobile nav) can hide that row too, from the same
 * `usePush()`, instead of mounting a second independent copy of the state.
 */
export function PushToggleButton({
  push,
  className,
}: {
  push: PushState;
  className?: string;
}) {
  const { status, enable, disable } = push;

  if (!canShowPushToggle(status)) return null;

  if (status === "blocked") {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        disabled
        aria-label={PUSH_LABELS.blocked}
        title={PUSH_LABELS.blocked}
      >
        <BellOff aria-hidden="true" />
      </Button>
    );
  }

  const isOn = status === "on";
  const label = isOn ? PUSH_LABELS.disable : PUSH_LABELS.enable;

  return (
    <Button
      variant="outline"
      size="icon"
      className={className}
      disabled={status === "enabling"}
      onClick={() => void (isOn ? disable() : enable())}
      aria-pressed={isOn}
      aria-label={status === "error" ? PUSH_LABELS.failed : label}
      title={status === "error" ? PUSH_LABELS.failed : label}
    >
      {isOn ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}
    </Button>
  );
}

/** Opt-in control for notifications. */
export function PushToggle({ className }: { className?: string }) {
  return <PushToggleButton push={usePush()} className={className} />;
}
