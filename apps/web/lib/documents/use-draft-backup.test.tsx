import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { sendHeartbeat } from "@/lib/api/presence";
import { useDraftBackup } from "./use-presence";

vi.mock("@/lib/api/presence", () => ({
  sendHeartbeat: vi.fn(),
  fetchPresence: vi.fn(),
  fetchOwnDraft: vi.fn(),
}));

const heartbeat = vi.mocked(sendHeartbeat);

function renderBackup(overrides: Partial<Parameters<typeof useDraftBackup>[1]> = {}) {
  return renderHook(() =>
    useDraftBackup("doc-1", {
      enabled: true,
      isDirty: true,
      canBackUp: true,
      encodeFullState: () => "ZW5jb2RlZA==",
      ...overrides,
    }),
  );
}

describe("useDraftBackup", () => {
  beforeEach(() => {
    heartbeat.mockReset().mockResolvedValue({ backedUpAt: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("beats immediately rather than waiting a full interval", async () => {
    renderBackup();

    // A tab closed within the first 25 seconds would otherwise have backed up
    // nothing at all — the window the beforeunload fallback exists to cover.
    await waitFor(() => expect(heartbeat).toHaveBeenCalledTimes(1));
  });

  it("sends the draft when there is one to back up", async () => {
    renderBackup();

    await waitFor(() =>
      expect(heartbeat).toHaveBeenCalledWith("doc-1", { update: "ZW5jb2RlZA==" }),
    );
  });

  it("still beats with no payload when nothing is dirty — presence is the point", async () => {
    renderBackup({ isDirty: false });

    await waitFor(() => expect(heartbeat).toHaveBeenCalledWith("doc-1", {}));
  });

  it("never sends a draft for a viewer", async () => {
    renderBackup({ canBackUp: false, isDirty: true });

    await waitFor(() => expect(heartbeat).toHaveBeenCalledWith("doc-1", {}));
  });

  it("does not beat at all while disabled", async () => {
    renderBackup({ enabled: false });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it.each([404, 403])(
    "reports revoked access on a %i",
    async (status) => {
      heartbeat.mockRejectedValue(new ApiError(status, "not_found", "gone"));

      const { result } = renderBackup();

      await waitFor(() => expect(result.current.accessRevoked).toBe(true));
    },
  );

  it("does not mistake a network failure for lost access", async () => {
    heartbeat.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderBackup();

    await waitFor(() => expect(heartbeat).toHaveBeenCalled());
    // Telling someone their access is gone because the wifi dropped would be
    // worse than saying nothing at all.
    expect(result.current.accessRevoked).toBe(false);
  });

  it("does not treat a server error as lost access either", async () => {
    heartbeat.mockRejectedValue(new ApiError(500, "internal", "boom"));

    const { result } = renderBackup();

    await waitFor(() => expect(heartbeat).toHaveBeenCalled());
    expect(result.current.accessRevoked).toBe(false);
  });

  it("clears the revoked flag once a beat succeeds again", async () => {
    // Fake timers for the whole test, not swapped in midway: the interval has to
    // be created under the same clock that later advances it.
    vi.useFakeTimers();
    heartbeat.mockRejectedValueOnce(new ApiError(404, "not_found", "gone"));

    const { result } = renderBackup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.accessRevoked).toBe(true);

    // Re-invited between beats: the banner should not outlive the condition.
    heartbeat.mockResolvedValue({ backedUpAt: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });

    expect(result.current.accessRevoked).toBe(false);
  });

  it("stops beating once unmounted", async () => {
    const { unmount } = renderBackup();
    await waitFor(() => expect(heartbeat).toHaveBeenCalledTimes(1));

    unmount();
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(heartbeat).toHaveBeenCalledTimes(1);
  });
});
