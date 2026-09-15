import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser, PresenceUser } from "@docsync/shared";
import { makeDoc, makeSnapshot, renderDocEditor } from "@/components/documents/doc-editor.test-utils";
import { fetchPresence } from "@/lib/api/presence";
import { useSession } from "@/lib/auth/use-session";

/**
 * techspec §7 frames presence as "who *else* has this doc open" — the API
 * returns everyone present including the caller by design, so `DocEditorLoaded`
 * is the only place that filters the caller back out (AC-109).
 */

vi.mock("@/lib/api/presence", () => ({
  sendHeartbeat: vi.fn().mockResolvedValue({ backedUpAt: null }),
  fetchPresence: vi.fn(),
  fetchOwnDraft: vi.fn(),
}));

vi.mock("@/lib/auth/use-session", () => ({
  useSession: vi.fn(),
}));

const presence = vi.mocked(fetchPresence);
const session = vi.mocked(useSession);

function person(overrides: Partial<PresenceUser> = {}): PresenceUser {
  return {
    userId: "user-a",
    name: "Ada Lovelace",
    avatarUrl: null,
    role: "editor",
    ...overrides,
  };
}

function authUser(id: string, name: string): AuthUser {
  return { id, email: `${id}@example.test`, name, avatarUrl: null, createdAt: "2026-01-01T00:00:00.000Z" };
}

function asSignedIn(id: string, name: string): void {
  session.mockReturnValue({
    data: authUser(id, name),
  } as unknown as ReturnType<typeof useSession>);
}

beforeEach(() => {
  presence.mockReset();
});

describe("DocEditor — presence self-exclusion [AC-109]", () => {
  it("names the other collaborator and does not list the signed-in caller among the chips", async () => {
    asSignedIn("user-a", "Ada Lovelace");
    presence.mockResolvedValue([
      person({ userId: "user-a", name: "Ada Lovelace" }),
      person({ userId: "user-b", name: "Priya Raman" }),
    ]);

    const doc = makeDoc({ snapshot: makeSnapshot("body") });
    renderDocEditor(doc);

    const chip = await screen.findByRole("img", { name: "Priya Raman has this open" });
    expect(chip).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("renders no chips at all when the only person present is the caller", async () => {
    asSignedIn("user-a", "Ada Lovelace");
    presence.mockResolvedValue([person({ userId: "user-a", name: "Ada Lovelace" })]);

    const doc = makeDoc({ snapshot: makeSnapshot("body") });
    renderDocEditor(doc);

    // Wait for the presence fetch to resolve and settle before asserting an
    // absence, or the absence proves nothing.
    await vi.waitFor(() => expect(presence).toHaveBeenCalled());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
