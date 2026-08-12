import { describe, expect, it } from "vitest";

import {
  materialRemovalConfirmationMessage,
  materialUpdateConfirmationMessage,
} from "../../../src/features/home/material-confirmation.js";

describe("material change confirmation messages", () => {
  it("discloses every destructive consequence of replacing a material", () => {
    expect(materialUpdateConfirmationMessage("replacement.txt", "My material")).toBe([
      "要以「replacement.txt」更新「My material」嗎？",
      "",
      "教材內容、圖片及閱讀位置會被取代或重設。",
      "無法對應新正文的螢光標記與位置型筆記會被移除。",
      "仍存在於新正文的已認識單字，以及所有教材共用的單字筆記會保留。",
    ].join("\n"));
  });

  it("distinguishes retained vocabulary records from recalculated learning state", () => {
    expect(materialRemovalConfirmationMessage("My material")).toBe([
      "確定要移除「My material」嗎？",
      "",
      "教材內容、圖片、閱讀位置、螢光標記與位置型筆記都會刪除。",
      "共用單字筆記與詞彙紀錄會保留；只在此教材標為已認識的單字，將改為未認識。",
    ].join("\n"));
  });
});
