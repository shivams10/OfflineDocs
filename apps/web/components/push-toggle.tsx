"use client";

import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PUSH_LABELS } from "@/constants/labels";
import { usePush } from "@/lib/push/use-push";

/**
 * Opt-in control for notifications. Renders nothing at all when push cannot work
 * here — an unsupported browser or a server with no VAPID keys — rather than a
 * disabled button the user cannot do anything about.
 */
export function PushToggle({ className }: { className?: string }) {
  const { status, enable, disable } = usePush();

  if (status === "checking" || status === "unavailable") return null;

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
