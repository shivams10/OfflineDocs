import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PresenceUser } from "@docsync/shared";
import { PresenceChips } from "./presence-chips";

function person(overrides: Partial<PresenceUser> = {}): PresenceUser {
  return {
    userId: "user-1",
    name: "Ada Lovelace",
    avatarUrl: null,
    role: "editor",
    ...overrides,
  };
}

describe("PresenceChips", () => {
  it("renders nothing when you are the only one here", () => {
    const { container } = render(<PresenceChips people={[]} />);

    // Not an empty frame or a "nobody else" label — the absence of chips is
    // itself the signal.
    expect(container).toBeEmptyDOMElement();
  });

  it("announces who is present as one label rather than unlabelled avatars", () => {
    render(
      <PresenceChips
        people={[
          person({ userId: "u1", name: "Ada Lovelace" }),
          person({ userId: "u2", name: "Priya Raman" }),
        ]}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Ada Lovelace, Priya Raman have this open" }),
    ).toBeInTheDocument();
  });

  it("uses the singular for one person", () => {
    render(<PresenceChips people={[person({ name: "Ada Lovelace" })]} />);

    expect(
      screen.getByRole("img", { name: "Ada Lovelace has this open" }),
    ).toBeInTheDocument();
  });

  it("falls back to a placeholder for a collaborator with no name", () => {
    render(<PresenceChips people={[person({ name: null })]} />);

    expect(
      screen.getByRole("img", { name: "Someone has this open" }),
    ).toBeInTheDocument();
  });

  it("caps the visible avatars and counts the rest", () => {
    render(
      <PresenceChips
        people={[
          person({ userId: "u1", name: "One" }),
          person({ userId: "u2", name: "Two" }),
          person({ userId: "u3", name: "Three" }),
          person({ userId: "u4", name: "Four" }),
          person({ userId: "u5", name: "Five" }),
        ]}
      />,
    );

    expect(screen.getByText("+2")).toBeInTheDocument();
    // Everyone is still named in the accessible label, including the overflow.
    expect(
      screen.getByRole("img", {
        name: "One, Two, Three, Four, Five have this open",
      }),
    ).toBeInTheDocument();
  });

  it("keeps a person's chip colour stable across renders", () => {
    const people = [person({ userId: "stable-id", name: "Ada" })];

    const first = render(<PresenceChips people={people} />);
    const firstClass = first.container.querySelector("span")?.className;
    first.unmount();

    const second = render(<PresenceChips people={people} />);
    const secondClass = second.container.querySelector("span")?.className;

    // A chip that changed colour on every poll would read as a different
    // person arriving, which is the opposite of what presence is for.
    expect(secondClass).toBe(firstClass);
  });
});
