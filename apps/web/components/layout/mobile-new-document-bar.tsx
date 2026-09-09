"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_SHELL_LABELS } from "@/constants/labels";
import { useMobileNav } from "@/components/layout/mobile-nav-context";

export function MobileNewDocumentBar() {
  const { isOpen } = useMobileNav();

  return (
    <div
      className="shrink-0 border-t border-border bg-card px-3.5 py-3 md:hidden"
      inert={isOpen || undefined}
    >
      <Button className="h-12 w-full">
        <Plus />
        {APP_SHELL_LABELS.newDocument}
      </Button>
    </div>
  );
}
