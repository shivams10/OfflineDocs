"use client";

import { useSyncExternalStore } from "react";
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

const noopSubscribe = () => () => {};
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const mounted = useSyncExternalStore(
    noopSubscribe,
    getHydratedSnapshot,
    getServerSnapshot,
  );
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
