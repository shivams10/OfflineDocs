import { describe, expect, it } from "vitest";
import {
  appendTranscript,
  joinTranscript,
  readTranscript,
  writeTranscript,
} from "@/lib/dictation/transcript-store";

let counter = 0;
const nextDocId = () => `store-doc-${++counter}`;

describe("transcript store", () => {
  it("reads back what was written, per document", async () => {
    const a = nextDocId();
    const b = nextDocId();
    await writeTranscript(a, "first doc");
    await writeTranscript(b, "second doc");

    expect(await readTranscript(a)).toBe("first doc");
    expect(await readTranscript(b)).toBe("second doc");
  });

  it("returns an empty string for a document with nothing saved", async () => {
    expect(await readTranscript(nextDocId())).toBe("");
  });

  it("deletes the entry when written empty", async () => {
    const docId = nextDocId();
    await writeTranscript(docId, "temp");
    await writeTranscript(docId, "");

    expect(await readTranscript(docId)).toBe("");
  });

  it("appends onto a saved transcript", async () => {
    const docId = nextDocId();
    await writeTranscript(docId, "Hello");
    await appendTranscript(docId, " world ");

    expect(await readTranscript(docId)).toBe("Hello world");
  });

  it("appends into an empty entry", async () => {
    const docId = nextDocId();
    await appendTranscript(docId, "fresh");

    expect(await readTranscript(docId)).toBe("fresh");
  });
});

describe("joinTranscript", () => {
  it.each([
    ["", "a", "a"],
    ["a", "", "a"],
    ["a", "  b ", "a b"],
    ["a\n", "b", "a\nb"],
  ])("joins %j and %j into %j", (existing, addition, expected) => {
    expect(joinTranscript(existing, addition)).toBe(expected);
  });
});
