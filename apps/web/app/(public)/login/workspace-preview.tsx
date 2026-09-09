import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DOC_STATUS_LABELS, WORKSPACE_PREVIEW } from "@/constants/labels";

/** Maps a document's sync state onto a Badge variant. */
const STATUS_VARIANT = {
  synced: "success",
  pending: "warning",
} as const;

export function WorkspacePreview({ className }: { className?: string }) {
  return (
    <Card
      aria-hidden
      className={cn("gap-0 border border-border py-0 shadow-sh-3 ring-0", className)}
    >
      {/* Window chrome — desktop only; the mobile design drops it for vertical room. */}
      <div className="hidden items-center gap-1.5 border-b border-border bg-muted px-3.5 py-3 lg:flex">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-2.5 rounded-full bg-border-strong" />
        ))}
        <span className="ml-auto text-meta text-muted-foreground">
          {WORKSPACE_PREVIEW.title}
        </span>
      </div>

      <ul>
        {WORKSPACE_PREVIEW.documents.map((doc, index) => (
          <li
            key={doc.id}
            className={cn(
              "flex items-center gap-3 px-4 py-3.5",
              index > 0 && "border-t border-border",
              // The third row is desktop-only: the mobile design shows two.
              index === 2 && "hidden lg:flex",
            )}
          >
            <span
              className={cn(
                "size-7.5 shrink-0 rounded-md border",
                doc.highlighted
                  ? "border-primary/25 bg-primary-soft"
                  : "border-border bg-accent",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-caption font-semibold text-foreground">
                {doc.name}
              </span>
              <span className="block truncate text-meta text-muted-foreground">
                {doc.meta}
              </span>
            </span>
            <Badge variant={STATUS_VARIANT[doc.status]} size="sm">
              {DOC_STATUS_LABELS[doc.status]}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
