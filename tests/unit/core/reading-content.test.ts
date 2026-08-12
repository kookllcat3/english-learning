import { describe, expect, it } from "vitest";
import {
  classifyReadingContent,
  readingProgressIndexForBlocks,
  sourceWordsForBlocks,
  wordsThroughReadingParagraph,
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

  it("classifies Windows TXT paragraphs independently", () => {
    const sections = classifyReadingContent([{
      type: "text",
      order: 0,
      text: "First English paragraph.\r\n\r\nSecond English paragraph.",
    }]);

    expect(sections).toMatchObject([
      { key: "0-0-0", role: "source", words: ["english", "first", "paragraph"] },
      { key: "0-0-1", role: "source", words: ["english", "paragraph", "second"] },
    ]);
  });

  it("splits a bilingual line sequence into independent reading paragraphs", () => {
    const sections = classifyReadingContent([{
      type: "text",
      order: 0,
      text: [
        "I've been a liar, been a thief",
        "我一直到處欺騙並竊取他人的心",
        "Been a lover, been a cheat",
        "我曾付出真心，也曾欺騙感情",
        "So let the river run",
      ].join("\n"),
    }]);

    expect(sections).toMatchObject([
      {
        key: "0-0-0",
        lines: [
          { role: "source", text: "I've been a liar, been a thief" },
          { role: "translation", text: "我一直到處欺騙並竊取他人的心" },
        ],
        role: "source",
      },
      {
        key: "0-0-0.2",
        lines: [
          { role: "source", text: "Been a lover, been a cheat" },
          { role: "translation", text: "我曾付出真心，也曾欺騙感情" },
        ],
        role: "source",
      },
      {
        key: "0-0-0.4",
        lines: [{ role: "source", text: "So let the river run" }],
        role: "source",
      },
    ]);
  });

  it("splits English line-oriented content without requiring translations", () => {
    const sections = classifyReadingContent([{
      type: "text",
      order: 0,
      text: [
        "I've been a liar, been a thief",
        "Been a lover, been a cheat",
        "All my sins need holy water, feel it washin' over me",
        "So let the river run",
      ].join("\n"),
    }]);

    expect(sections).toMatchObject([
      { key: "0-0-0", lines: [{ role: "source" }], role: "source" },
      { key: "0-0-0.1", lines: [{ role: "source" }], role: "source" },
      { key: "0-0-0.2", lines: [{ role: "source" }], role: "source" },
      { key: "0-0-0.3", lines: [{ role: "source" }], role: "source" },
    ]);
  });

  it("keeps a multiline English paragraph intact without an interleaved translation", () => {
    const sections = classifyReadingContent([{
      type: "text",
      order: 0,
      text: [
        "This paragraph wraps manually",
        "but remains one continuous thought",
        "and should stay together.",
      ].join("\n"),
    }]);

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      key: "0-0-0",
      lines: [
        { role: "source", text: "This paragraph wraps manually" },
        { role: "source", text: "but remains one continuous thought" },
        { role: "source", text: "and should stay together." },
      ],
      role: "source",
    });
  });

  it("keeps complete English prose sentences in one hard paragraph", () => {
    const sections = classifyReadingContent([{
      type: "text",
      order: 0,
      text: [
        "This is the first sentence.",
        "This is the second sentence.",
        "This is the third sentence.",
      ].join("\n"),
    }]);

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ key: "0-0-0", role: "source" });
  });

  it("attaches an adjacent short Chinese text block as a source translation", () => {
    const sections = classifyReadingContent([
      { type: "text", order: 0, text: "That Arizona sky" },
      { type: "text", order: 1, text: "亞利桑那州的天空" },
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      key: "0-0-0",
      lines: [
        { role: "source", text: "That Arizona sky" },
        { role: "translation", text: "亞利桑那州的天空" },
      ],
      words: ["arizona", "sky", "that"],
    });
  });

  it("classifies a short Chinese line immediately after source text as a translation", () => {
    const sections = classifyReadingContent([{
      type: "text",
      order: 0,
      text: "That Arizona sky\n亞利桑那州的天空",
    }]);

    expect(sections[0]).toMatchObject({
      lines: [
        { role: "source", text: "That Arizona sky" },
        { role: "translation", text: "亞利桑那州的天空" },
      ],
    });
  });

  it("keeps an adjacent labeled Chinese reference outside a source group", () => {
    const sections = classifyReadingContent([
      { type: "text", order: 0, text: "That Arizona sky" },
      { type: "text", order: 1, text: "學習方法：想像畫面來記憶單字" },
    ]);

    expect(sections).toMatchObject([
      { role: "source", lines: [{ role: "source" }] },
      { role: "mixed-reference", lines: [{ role: "mixed-reference" }] },
    ]);
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

  it("indexes unique source words by first occurrence and paragraph boundary", () => {
    const blocks: ContentBlock[] = [
      { type: "text", order: 0, text: "Course Overview" },
      { type: "text", order: 1, text: "EN The bear runs.\n熊跑了。" },
      { type: "text", order: 2, text: "The bear sleeps.\n熊睡著了。" },
      { type: "text", order: 3, text: "Bear runs.\n熊跑了。" },
      { type: "text", order: 4, text: "WORD POWER: forest 森林" },
    ];

    const index = readingProgressIndexForBlocks(blocks);

    expect(index.orderedUniqueWords).toEqual(["the", "bear", "runs", "sleeps"]);
    expect([...index.paragraphEndWordIndex.entries()]).toEqual([
      ["1-1-0", 3],
      ["2-2-0", 4],
      ["3-3-0", 4],
    ]);
    expect(wordsThroughReadingParagraph(index, "1-1-0")).toEqual(["the", "bear", "runs"]);
    expect(wordsThroughReadingParagraph(index, "3-3-0"))
      .toEqual(["the", "bear", "runs", "sleeps"]);
  });

  it("rejects a paragraph key outside the source progress index", () => {
    const index = readingProgressIndexForBlocks([
      { type: "text", order: 0, text: "Birds can fly." },
    ]);

    expect(() => wordsThroughReadingParagraph(index, "missing"))
      .toThrow("指定的閱讀段落不存在。");
  });
});
