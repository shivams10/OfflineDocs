export const THEME_STORAGE_KEY = "docsync-theme";

export type ThemeChoice = "light" | "dark" | "system";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

function readStored(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

let current: ThemeChoice | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

export function setTheme(choice: ThemeChoice): void {
  current = choice;
  applyTheme(choice);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
  }
  emit();
}

export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    current = null; // force a re-read
    const next = getThemeSnapshot();
    applyTheme(next);
    onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getThemeSnapshot(): ThemeChoice {
  current ??= readStored();
  return current;
}

export function getThemeServerSnapshot(): ThemeChoice {
  return "system";
}
