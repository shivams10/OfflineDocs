import { cn } from "@/lib/utils";
import { BRAND } from "@/constants/labels";

/** Monogram plus wordmark. Sized by the caller so it can differ per breakpoint. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 font-semibold", className)}>
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-caption font-bold text-primary-foreground"
      >
        {BRAND.monogram}
      </span>
      {BRAND.name}
    </div>
  );
}
