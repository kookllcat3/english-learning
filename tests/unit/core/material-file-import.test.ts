import { describe, expect, it } from "vitest";

import { MATERIAL_FILE_ACCEPT, readMaterialFile } from "../../../src/core/materials/material-file-import.js";

describe("material file import", () => {
  it("shares the supported file picker types", () => {
    expect(MATERIAL_FILE_ACCEPT).toContain(".txt");
    expect(MATERIAL_FILE_ACCEPT).toContain(".pdf");
    expect(MATERIAL_FILE_ACCEPT).toContain(".docx");
  });

  it("reads a UTF-8 text file", async () => {
    const file = new File(["A bear sleeps.\n熊正在睡覺。"], "lesson.txt", { type: "text/plain" });
    await expect(readMaterialFile(file)).resolves.toEqual({
      assets: [],
      content: "A bear sleeps.\n熊正在睡覺。",
      contentBlocks: undefined,
    });
  });

  it("rejects oversized text files before reading them", async () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.txt", { type: "text/plain" });
    await expect(readMaterialFile(file)).rejects.toThrow("TXT 檔案請控制在 2 MB 以內");
  });

  it("rejects unsupported files", async () => {
    const file = new File(["data"], "lesson.html", { type: "text/html" });
    await expect(readMaterialFile(file)).rejects.toThrow("只支援 UTF-8 TXT、文字型 PDF 或 DOCX");
  });
});
