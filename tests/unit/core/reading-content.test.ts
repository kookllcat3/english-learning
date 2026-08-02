import { describe, expect, it } from "vitest";
import {
  classifyReadingContent,
  sourceWordsForBlocks,
} from "../../../src/core/learning/reading-content.js";
import type { ContentBlock } from "../../../src/core/models/models.js";

describe("reading content classification", () => {
  it("groups plain-text source paragraphs with their translations", () => {
    const sections = classifyReadingContent([{
      type: "text",
      order: 0,
      text: "A bear runs.\n熊跑了。\n\nThe fox sleeps.\n狐狸睡著了。",
    }]);

    expect(sections).toHaveLength(2);
    expect(sections.map((section) => section.type === "text" ? section.role : section.type))
      .toEqual(["source", "source"]);
    expect(sections[0]).toMatchObject({
      key: "0-0-0",
      lines: [{ role: "source" }, { role: "translation" }],
      words: ["a", "bear", "runs"],
    });
    expect(sections[1]).toMatchObject({
      key: "0-0-1",
      lines: [{ role: "source" }, { role: "translation" }],
      words: ["fox", "sleeps", "the"],
    });
  });

  it("keeps DOCX headings, bilingual labels, and references outside source text", () => {
    const blocks: ContentBlock[] = [
      { type: "text", order: 0, text: "A1 ENGLISH · 30 UNITS" },
      { type: "text", order: 1, text: "Meet the Animals" },
      { type: "text", order: 2, text: "01 Lion 獅子" },
      { type: "image", order: 3, assetId: "lion", alt: "", caption: "" },
      { type: "text", order: 4, text: "EN The lion lives in a pride." },
      { type: "text", order: 5, text: "中 獅子生活在獅群裡。" },
      { type: "text", order: 6, text: "WORD POWER: pride 獅群" },
    ];

    const sections = classifyReadingContent(blocks);
    expect(sections.map((section) => section.type === "text" ? section.role : section.type))
      .toEqual(["heading", "heading", "mixed-reference", "image", "source", "mixed-reference"]);
    expect(sections[4]).toMatchObject({
      key: "4-4-0",
      lines: [
        { interactiveTextStart: 3, role: "source" },
        { role: "translation" },
      ],
      words: ["a", "in", "lion", "lives", "pride", "the"],
    });
  });

  it("extracts only words from classified source text", () => {
    const blocks: ContentBlock[] = [
      { type: "text", order: 0, text: "A1 ENGLISH · 30 UNITS" },
      { type: "text", order: 1, text: "EN Birds can fly." },
      { type: "text", order: 2, text: "中 birds 是鳥類。" },
      { type: "text", order: 3, text: "WORD POWER: avian 鳥類的" },
    ];

    expect(sourceWordsForBlocks(blocks)).toEqual(["birds", "can", "fly"]);
  });

  it("classifies ambiguous short English labels conservatively", () => {
    const sections = classifyReadingContent([{
      type: "text",
      order: 0,
      text: "Meet the Animals",
    }]);

    expect(sections[0]).toMatchObject({ role: "heading", words: [] });
  });

  it("keeps a single-word legacy text material learnable", () => {
    const sections = classifyReadingContent([{
      type: "text",
      order: 0,
      text: "Animal",
    }]);

    expect(sections[0]).toMatchObject({ role: "source", words: ["animal"] });
  });

  it("recognizes an unpunctuated sentence without treating title case as source", () => {
    const sections = classifyReadingContent([
      { type: "text", order: 0, text: "Birds can fly" },
      { type: "text", order: 1, text: "Introduction to Grammar" },
    ]);

    expect(sections[0]).toMatchObject({ role: "source", words: ["birds", "can", "fly"] });
    expect(sections[1]).toMatchObject({ role: "heading", words: [] });
  });
});
