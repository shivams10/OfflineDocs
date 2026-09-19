"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { QUEUE_LABELS } from "@/constants/labels";
import { discardRejected } from "@/lib/offline/save-queue";

/**
 * Surfaces work the server refused because access was revoked while it waited.
 * The changes stay on the device until the user decides — discarding is theirs
 * to choose, never ours (§16.2), and Copy text is offered first so choosing it
 * does not mean losing the writing.
 */
export function RejectedSaveNotice({ docId, body }: { docId: string; body: string }) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
    } catch (error) {
      console.warn("[queue] could not copy the document text", error);
    }
  }

  return (
    <div
      role="alert"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-destructive/20 bg-destructive-soft px-4 py-2 text-caption text-destructive sm:px-8"
    >
      <span className="font-medium">{QUEUE_LABELS.rejectedTitle}</span>
      <span>{QUEUE_LABELS.rejectedBody}</span>

      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? QUEUE_LABELS.copied : QUEUE_LABELS.copyText}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          {QUEUE_LABELS.discard}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={QUEUE_LABELS.confirmDiscardTitle}
        description={QUEUE_LABELS.confirmDiscardDescription}
        cancelLabel={QUEUE_LABELS.confirmDiscardCancel}
        confirmLabel={QUEUE_LABELS.confirmDiscardAction}
        onConfirm={() => void discardRejected(docId)}
      />
    </div>
  );
}
