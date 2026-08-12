import { describe, expect, it } from "vitest";
import { updateMaterialParagraphTranslation } from "../../../src/core/materials/material-translation.js";

describe("material paragraph translations", () => {
  it("updates all existing translation lines beneath a source paragraph", () => {
    const update = updateMaterialParagraphTranslation([{
      type: "text",
      order: 0,
      text: "A bear runs.\n熊正在奔跑。\n補充說明。\n\nThe fox sleeps.\n狐狸在睡覺。",
    }], "0-0-0", "熊快速地奔跑。\n第二行會合併");

    expect(update.contentBlocks).toEqual([{
      type: "text",
      order: 0,
      text: "A bear runs.\n熊快速地奔跑。 第二行會合併\n\nThe fox sleeps.\n狐狸在睡覺。",
    }]);
    expect(update.content).toBe(
      "A bear runs.\n熊快速地奔跑。 第二行會合併\n\nThe fox sleeps.\n狐狸在睡覺。",
    );
  });

  it("adds a translation after an English line-oriented paragraph", () => {
    const update = updateMaterialParagraphTranslation([{
      type: "text",
      order: 0,
      text: "I've been a liar, been a thief\nBeen a lover, been a cheat\nAll my sins need holy water",
    }], "0-0-0.1", "我曾愛過，也曾欺騙。 ");

    expect(update.contentBlocks[0]).toEqual({
      type: "text",
      order: 0,
      text: "I've been a liar, been a thief\nBeen a lover, been a cheat\n我曾愛過，也曾欺騙。\nAll my sins need holy water",
    });
  });

  it("updates an adjacent translation stored in a separate text block", () => {
    const update = updateMaterialParagraphTranslation([
      { type: "text", order: 0, text: "Arizona skies." },
      { type: "text", order: 1, text: "亞利桑那州的天空" },
    ], "0-0-0", "亞利桑那的天空。 ");

    expect(update.contentBlocks).toEqual([
      { type: "text", order: 0, text: "Arizona skies." },
      { type: "text", order: 1, text: "亞利桑那的天空。" },
    ]);
  });

  it("removes all translations when the saved explanation is empty", () => {
    const update = updateMaterialParagraphTranslation([{
      type: "text",
      order: 0,
      text: "A bear runs.\n熊正在奔跑。\n補充說明。\n\nThe fox sleeps.\n狐狸在睡覺。",
    }], "0-0-0", " \n ");

    expect(update.contentBlocks).toEqual([{
      type: "text",
      order: 0,
      text: "A bear runs.\n\nThe fox sleeps.\n狐狸在睡覺。",
    }]);
  });

  it("removes an empty adjacent translation block", () => {
    const update = updateMaterialParagraphTranslation([
      { type: "text", order: 0, text: "Arizona skies." },
      { type: "text", order: 1, text: "亞利桑那州的天空" },
    ], "0-0-0", "");

    expect(update.contentBlocks).toEqual([
      { type: "text", order: 0, text: "Arizona skies." },
    ]);
    expect(update.content).toBe("Arizona skies.");
  });

  it("keeps source-only content unchanged when an empty explanation is saved", () => {
    const blocks = [{ type: "text" as const, order: 0, text: "A bear runs." }];
    expect(updateMaterialParagraphTranslation(blocks, "0-0-0", " ").contentBlocks)
      .toEqual(blocks);
  });

  it("accepts a Chinese explanation containing English text", () => {
    const update = updateMaterialParagraphTranslation([{
      type: "text",
      order: 0,
      text: "A bear runs.",
    }], "0-0-0", "bear 的意思是熊。");

    expect(update.content).toBe("A bear runs.\nbear 的意思是熊。");
  });

  it("rejects non-Chinese, oversized, and missing translations", () => {
    const blocks = [{ type: "text" as const, order: 0, text: "A bear runs." }];
    ["A bear runs.", "12345", "!?…"].forEach((text) => {
      expect(() => updateMaterialParagraphTranslation(blocks, "0-0-0", text))
        .toThrow("中文解釋必須包含中文字。");
    });
    expect(blocks).toEqual([{ type: "text", order: 0, text: "A bear runs." }]);
    expect(() => updateMaterialParagraphTranslation(blocks, "0-0-0", "中".repeat(2_001)))
      .toThrow("中文解釋不能超過 2,000 個字元。");
    expect(() => updateMaterialParagraphTranslation(blocks, "9-9-9", "翻譯"))
      .toThrow("找不到指定的英文段落。");
  });
});
