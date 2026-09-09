import { Search } from "lucide-react";
import { APP_SHELL_LABELS } from "@/constants/labels";
import { cn } from "@/lib/utils";

export function DocumentSearch({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        placeholder={APP_SHELL_LABELS.searchPlaceholder}
        className="h-9.5 w-full rounded-lg border border-input bg-card py-2 pr-3 pl-9 text-ui placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      />
    </div>
  );
}
