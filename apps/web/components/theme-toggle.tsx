"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

const CYCLE = ["light", "dark", "system"] as const;
type Choice = (typeof CYCLE)[number];

const ICONS: Record<Choice, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  /* The server has no way to know the theme, so any icon rendered there is a
     guess — and a wrong guess is a hydration mismatch. Hold a same-sized
     placeholder until the client has read the stored value; returning null
     instead would shift the layout when the button appears. */
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="size-9" aria-hidden />;

  const current = (CYCLE as readonly string[]).includes(theme ?? "")
    ? (theme as Choice)
    : "system";
  const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
  const Icon = ICONS[current];

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${current}. Switch to ${next}.`}
    >
      <Icon />
    </Button>
  );
}
