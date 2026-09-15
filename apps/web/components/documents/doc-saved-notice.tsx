"use client";

import { useEffect, useState } from "react";
import type { PushPayload } from "@docsync/shared";
import { PUSH_LABELS } from "@/constants/labels";

interface Message {
  type?: string;
  payload?: PushPayload;
}

/**
 * The in-app half of push suppression.
 *
 * When a collaborator saves a document you already have open and focused, the
 * service worker deliberately does not raise an OS notification — an alert for the
 * thing on your screen is noise — and posts the payload here instead (techspec 6).
 *
 * Reload is offered rather than performed: this phase has no live merge, and
 * silently pulling someone else's text in under an unsaved local draft is exactly
 * the surprise the explicit-save model exists to avoid.
 */
export function DocSavedNotice({ docId }: { docId: string }) {
  const [notice, setNotice] = useState<PushPayload | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    function onMessage(event: MessageEvent<Message>) {
      const { type, payload } = event.data ?? {};
      if (type !== "docsync:doc-saved" || !payload) return;
      // The worker targets by focused tab, but a browser can focus more than one
      // window — check the payload is about *this* document before showing it.
      if (payload.docId !== docId) return;
      setNotice(payload);
    }

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [docId]);

  if (!notice) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 border-b border-brand/25 bg-brand-soft px-4 py-2 text-caption text-brand sm:px-8"
    >
      <span className="min-w-0 flex-1 truncate">
        {notice.editorName} {PUSH_LABELS.savedSuffix}
      </span>
      <button
        type="button"
        className="underline"
        onClick={() => window.location.reload()}
      >
        {PUSH_LABELS.reload}
      </button>
      <button
        type="button"
        className="underline"
        onClick={() => setNotice(null)}
      >
        {PUSH_LABELS.dismiss}
      </button>
    </div>
  );
}
