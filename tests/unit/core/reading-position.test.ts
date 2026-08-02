import { describe, expect, it } from "vitest";
import {
  normalizedReadingParagraphKey,
  readingParagraphKey,
  readingParagraphKeys,
  splitReadingParagraphs,
} from "../../../src/core/learning/reading-position.js";

describe("reading position references", () => {
  const text = "First paragraph.\n翻譯。\n\nSecond paragraph.";
  const blocks = [
    { type: "image" as const, assetId: "image", alt: "", caption: "", order: 0 },
    { type: "text" as const, text, order: 1 },
  ];

  it("uses the same stable keys for rendered and persisted paragraphs", () => {
    expect(splitReadingParagraphs(text)).toEqual([
      "First paragraph.\n翻譯。",
      "Second paragraph.",
    ]);
    expect(readingParagraphKey(1, 1, 0)).toBe("1-1-0");
    expect([...readingParagraphKeys(blocks)]).toEqual(["1-1-0", "1-1-1"]);
  });

  it("clears malformed and orphaned paragraph references", () => {
    expect(normalizedReadingParagraphKey("1-1-1", blocks)).toBe("1-1-1");
    expect(normalizedReadingParagraphKey("1-1-9", blocks)).toBeNull();
    expect(normalizedReadingParagraphKey("not-a-key", blocks)).toBeNull();
    expect(normalizedReadingParagraphKey(undefined, blocks)).toBeNull();
  });
});
