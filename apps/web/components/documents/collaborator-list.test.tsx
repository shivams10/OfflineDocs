import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DocCollaboratorDto } from "@docsync/shared";
import { CollaboratorList } from "@/components/documents/collaborator-list";
import { SHARE_PANEL_LABELS } from "@/constants/labels";

/**
 * A member row's name/email fallback chain (AC-15, AC-16): `email` is null
 * for anyone but an owner, so the row must never render a blank line where
 * an address used to be, and a member with neither a display name nor a
 * visible email must still render — not throw — with a readable placeholder.
 */

function member(overrides: Partial<DocCollaboratorDto> = {}): DocCollaboratorDto {
  return {
    userId: "user-1",
    name: "Ada Lovelace",
    email: null,
    avatarUrl: null,
    role: "editor",
    ...overrides,
  };
}

describe("CollaboratorList — name/email fallback rendering", () => {
  it("renders no email line for a member whose email is null [AC-15]", () => {
    const collaborators = [
      member({ userId: "user-1", name: "Ada Lovelace", email: null }),
      member({ userId: "user-2", name: "Grace Hopper", email: null }),
    ];

    render(<CollaboratorList label="Members" collaborators={collaborators} />);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();

    // No email line anywhere in the rendered list, and no blank gap where
    // one used to be — the row is exactly the one name line per member.
    const list = screen.getByRole("list");
    expect(list.textContent).not.toContain("@");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    for (const item of screen.getAllByRole("listitem")) {
      expect(item.querySelectorAll("p")).toHaveLength(1);
    }
  });

  it('reads "Unnamed collaborator" with "UN" initials for a member with neither a name nor a visible email [AC-16]', () => {
    const collaborators = [member({ userId: "user-1", name: null, email: null })];

    expect(() =>
      render(<CollaboratorList label="Members" collaborators={collaborators} />),
    ).not.toThrow();

    expect(
      screen.getByText(SHARE_PANEL_LABELS.unnamedCollaborator),
    ).toBeInTheDocument();
    expect(screen.getByText("UN")).toBeInTheDocument();
  });
});
