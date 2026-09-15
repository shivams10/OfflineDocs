import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  makeDoc,
  makeSnapshot,
  renderDocEditor,
} from "@/components/documents/doc-editor.test-utils";
import { bytesToBase64 } from "@/lib/documents/base64";
import { fetchOwnDraft, fetchPresence, sendHeartbeat } from "./presence";

/**
 * TS-19 [AC-116] — techspec 4.1's whole justification for the server-side
 * draft backup is that local IndexedDB "doesn't help if storage is cleared
 * or the user never comes back on that device", so the backup exists "to
 * resume their own draft". A backup that is written but never read back on
 * the client is not a backup.
 *
 * EXPECTED TO FAIL AS WRITTEN. `fetchOwnDraft` (this file's own export) has
 * no caller anywhere in the web app: `useYjsDoc` seeds only from the doc's
 * server `snapshot` prop, never from the draft endpoint. This test is the
 * defect report for basis U-2, not a target to weaken until green — see the
 * plan's TS-19 notes. It stays in the suite, and stays red, until the
 * restore is actually wired up (or U-2 comes back "deferred").
 */
vi.mock("./presence", () => ({
  sendHeartbeat: vi.fn(),
  fetchPresence: vi.fn(),
  fetchOwnDraft: vi.fn(),
}));

afterEach(() => {
  vi.mocked(fetchOwnDraft).mockReset();
  vi.mocked(sendHeartbeat).mockReset();
  vi.mocked(fetchPresence).mockReset();
});

function backupUpdate(text: string): string {
  const ydoc = new Y.Doc();
  ydoc.getText("body").insert(0, text);
  return bytesToBase64(Y.encodeStateAsUpdate(ydoc));
}

it("fetches and offers the caller's own backup when local state is gone [AC-116]", async () => {
  // A server snapshot that is real but stale, and no local IndexedDB state
  // (this is a fresh jsdom + fake-indexeddb instance per test) — exactly the
  // "storage cleared, or a different device" case AC-116 describes.
  const doc = makeDoc({ snapshot: makeSnapshot("stale server content") });

  vi.mocked(fetchOwnDraft).mockResolvedValue({
    update: backupUpdate("newer content only the backup has"),
    backedUpAt: "2026-09-14T00:00:00.000Z",
  });
  vi.mocked(sendHeartbeat).mockResolvedValue({ backedUpAt: null });
  vi.mocked(fetchPresence).mockResolvedValue([]);

  renderDocEditor(doc);

  // Give the editor's effects (Yjs/IndexedDB seeding, any restore fetch) a
  // full microtask+timer turn to settle before asserting.
  await waitFor(() => {
    expect(screen.getByPlaceholderText).toBeTruthy();
  });

  // The AC's entire point: the backup must actually be fetched. Today
  // nothing in the render path calls this, so the assertion below fails —
  // that failure *is* the finding.
  await waitFor(() => expect(fetchOwnDraft).toHaveBeenCalledWith(doc.id));

  // And once fetched, its content must be reachable — either applied to the
  // document directly or offered behind an explicit restore control. Neither
  // exists yet, so this is a second, independent way the same gap shows up.
  const body = screen.getByPlaceholderText(
    /.*/,
  ) as HTMLTextAreaElement | null;
  const restoreControl = screen.queryByRole("button", { name: /restore/i });
  const contentSurfaced =
    body?.value.includes("newer content only the backup has") ??
    false;
  expect(contentSurfaced || restoreControl !== null).toBe(true);
});
