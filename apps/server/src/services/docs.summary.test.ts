import { describe, expect, it } from "vitest";
import { describeChange } from "./docs.js";

/**
 * Pure grammar of the push-notification copy (techspec 4: "Priya added 3 lines").
 * AC-131 is disputed — techspec attributes from the Yjs client-id, the
 * implementation from a line-count delta (basis U-7) — so this only pins the
 * uncontested part: the wording agrees in number with however many lines moved.
 */
describe("describeChange — grammatical number matches the line delta [AC-131]", () => {
  it("says '1 line' (singular) for a single added line", () => {
    expect(describeChange("a", "a\nb")).toBe("added 1 line");
  });

  it("says '3 lines' (plural) for three added lines", () => {
    expect(describeChange("a", "a\nb\nc\nd")).toBe("added 3 lines");
  });

  it("says '1 line' (singular) for a single removed line", () => {
    expect(describeChange("a\nb", "a")).toBe("removed 1 line");
  });

  it("says '3 lines' (plural) for three removed lines", () => {
    expect(describeChange("a\nb\nc\nd", "a")).toBe("removed 3 lines");
  });

  it("has non-line-count wording when the edit changes text but not the line count", () => {
    expect(describeChange("hello", "world")).toBe("edited this document");
  });

  it("has non-line-count wording for an empty-to-empty save", () => {
    expect(describeChange("", "")).toBe("edited this document");
  });
});
