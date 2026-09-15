import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDITOR_LABELS, PRESENCE_LABELS } from "@/constants/labels";
import { ApiError } from "@/lib/api/client";
import {
  makeDoc,
  makeSnapshot,
  renderDocEditor,
  setOnline,
} from "@/components/documents/doc-editor.test-utils";
import { fetchPresence, sendHeartbeat } from "@/lib/api/presence";

// basis U-4 is open: draft preservation on revocation is an assumption traced
// from the offline-first design intent (techspec 4.1's "explicit Save is the
// only thing that publishes work"), not a line item techspec §9 states in so
// many words. If product decides a revoked user's local draft should be
// discarded instead, this test's expectation inverts.

vi.mock("@/lib/api/presence", () => ({
  sendHeartbeat: vi.fn(),
  fetchPresence: vi.fn(),
  fetchOwnDraft: vi.fn(),
}));

const heartbeat = vi.mocked(sendHeartbeat);
const presence = vi.mocked(fetchPresence);

beforeEach(() => {
  setOnline(true);
  heartbeat.mockReset();
  presence.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DocEditor — access revoked mid-session [AC-117]", () => {
  it("surfaces an alert and keeps the unsaved text, while presence polling stops", async () => {
    vi.useFakeTimers();
    heartbeat.mockRejectedValue(new ApiError(403, "forbidden", "You no longer have access"));

    const doc = makeDoc({ snapshot: makeSnapshot("existing") });
    renderDocEditor(doc);

    const body = screen.getByPlaceholderText(EDITOR_LABELS.bodyPlaceholder);
    fireEvent.change(body, { target: { value: "existing, plus unsaved work" } });

    // The first heartbeat fires immediately on mount (no interval wait), and
    // its rejection settles on the microtask queue rather than a timer — flush
    // that without advancing the clock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(PRESENCE_LABELS.accessRevokedTitle);
    expect(alert).toHaveTextContent(PRESENCE_LABELS.accessRevokedHint);
    expect(screen.getByRole("button", { name: PRESENCE_LABELS.copyText })).toBeInTheDocument();

    // The typed text was never cleared or hidden by the revoked state.
    expect(body).toHaveValue("existing, plus unsaved work");

    // Presence was fetched once on mount; once access is revoked, usePresence's
    // `enabled` flips to false, so a full poll interval later there must be no
    // second call.
    const callsAtRevoke = presence.mock.calls.length;
    expect(callsAtRevoke).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(presence.mock.calls.length).toBe(callsAtRevoke);
  });
});
