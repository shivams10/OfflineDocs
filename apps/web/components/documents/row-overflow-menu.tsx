import { Copy, Info, MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { CollaboratorRole } from "@docsync/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DOCUMENT_ROW_LABELS } from "@/constants/labels";

// Share/leave are omitted, not disabled, per D9 — those endpoints don't
// exist until Part 3. Extend this table then, don't pre-build for it now.
type RowAction = "rename" | "duplicate" | "delete";

const ACTIONS_BY_ROLE: Record<CollaboratorRole, readonly RowAction[]> = {
  owner: ["rename", "duplicate", "delete"],
  editor: ["duplicate"],
  viewer: ["duplicate"],
};

export function RowOverflowMenu({
  role,
  onOpenDetails,
  onRename,
  onDuplicate,
  onDelete,
  busy,
}: {
  role: CollaboratorRole;
  onOpenDetails: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  busy?: boolean;
}) {
  const allowed = ACTIONS_BY_ROLE[role];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={DOCUMENT_ROW_LABELS.rowActions}
            disabled={busy}
          />
        }
      >
        <MoreVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onOpenDetails}>
          <Info />
          {DOCUMENT_ROW_LABELS.viewDetails}
        </DropdownMenuItem>

        {allowed.includes("rename") && onRename ? (
          <DropdownMenuItem onClick={onRename}>
            <Pencil />
            {DOCUMENT_ROW_LABELS.rename}
          </DropdownMenuItem>
        ) : null}

        {allowed.includes("duplicate") && onDuplicate ? (
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy />
            {DOCUMENT_ROW_LABELS.duplicate}
          </DropdownMenuItem>
        ) : null}

        {allowed.includes("delete") && onDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 />
              {DOCUMENT_ROW_LABELS.delete}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
