import { describe, expect, it } from "vitest";
import { insertText } from "@/lib/dictation/insert-text";

describe("insertText", () => {
  it("appends at the end when no cursor is known", () => {
    expect(insertText("Hello", null, "world")).toEqual({ body: "Hello world", caret: 11 });
  });

  it("inserts into an empty body without padding", () => {
    expect(insertText("", null, "  hi  ")).toEqual({ body: "hi", caret: 2 });
  });

  it("pads both sides when landing between two words", () => {
    const result = insertText("onetwo", { start: 3, end: 3 }, "and");
    expect(result).toEqual({ body: "one and two", caret: 7 });
  });

  it("adds no extra space next to existing whitespace", () => {
    expect(insertText("one two", { start: 4, end: 4 }, "big")).toEqual({
      body: "one big two",
      caret: 7,
    });
  });

  it("replaces a selected range", () => {
    expect(insertText("say old here", { start: 4, end: 7 }, "new")).toEqual({
      body: "say new here",
      caret: 7,
    });
  });

  it("clamps a stale cursor that is past the end of a shorter body", () => {
    expect(insertText("short", { start: 40, end: 50 }, "tail")).toEqual({
      body: "short tail",
      caret: 10,
    });
  });

  it("leaves the body alone for blank text", () => {
    expect(insertText("keep", { start: 2, end: 2 }, "   ")).toEqual({ body: "keep", caret: 2 });
  });
});
