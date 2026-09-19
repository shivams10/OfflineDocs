import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PushPayload } from "@docsync/shared";
import { PUSH_LABELS } from "@/constants/labels";
import { DocSavedNotice } from "./doc-saved-notice";

/**
 * `navigator.serviceWorker` doesn't exist in jsdom, so each test installs a
 * plain EventTarget in its place — enough for the component's
 * `addEventListener("message", ...)` / `removeEventListener` pair, and real
 * enough that `dispatchEvent(new MessageEvent(...))` exercises the same path
 * a real worker's `postMessage` would.
 */
function stubServiceWorker(): EventTarget {
  const target = new EventTarget();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: target,
  });
  return target;
}

function payload(overrides: Partial<PushPayload> = {}): PushPayload {
  return {
    docId: "doc-1",
    docTitle: "Quarterly plan",
    editorName: "Ada Lovelace",
    changeSummary: "added 3 lines",
    ...overrides,
  };
}

/** Wrapped in act(): the listener fires outside React's own event system, so
 *  the resulting setState needs an explicit flush to land before assertions. */
function postMessage(
  worker: EventTarget,
  data: { type?: string; payload?: PushPayload },
) {
  act(() => {
    worker.dispatchEvent(new MessageEvent("message", { data }));
  });
}

describe("DocSavedNotice — the in-app half of push suppression [AC-127]", () => {
  it("shows a notice naming the editor when the worker hands off a doc-saved message for this doc [AC-127]", () => {
    const worker = stubServiceWorker();
    render(<DocSavedNotice docId="doc-1" />);

    postMessage(worker, {
      type: "docsync:doc-saved",
      payload: payload({ docId: "doc-1", editorName: "Ada Lovelace" }),
    });

    expect(
      screen.getByText(`Ada Lovelace ${PUSH_LABELS.savedSuffix}`),
    ).toBeInTheDocument();
  });

  it("renders nothing for a doc-saved message about a different document [AC-127]", () => {
    const worker = stubServiceWorker();
    render(<DocSavedNotice docId="doc-1" />);

    postMessage(worker, {
      type: "docsync:doc-saved",
      payload: payload({ docId: "doc-2", editorName: "Priya Raman" }),
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/Priya Raman/)).not.toBeInTheDocument();
  });

  it("renders nothing for a worker message of an unrelated type [AC-127]", () => {
    const worker = stubServiceWorker();
    render(<DocSavedNotice docId="doc-1" />);

    postMessage(worker, {
      type: "docsync:push-subscribed",
      payload: payload({ docId: "doc-1" }),
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
