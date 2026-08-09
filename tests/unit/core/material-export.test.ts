import { describe, expect, it } from "vitest";

import { createMaterialExport, safeMaterialFileName } from "../../../src/core/materials/material-export.js";
import { loadJsZip } from "../../../src/core/services/jszip-loader.js";
import type { BackupMaterial, MaterialAssetRecord } from "../../../src/core/models/models.js";

const material: BackupMaterial = {
  id: "material-id",
  title: "圖文：教材 / 測試",
  description: "",
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
  wordCount: 3,
  knownCount: 0,
  knownWords: [],
  content: "A first line.\nSecond line.\n\n中文翻譯。",
  contentBlocks: [
    { type: "text", text: "A first line.\nSecond line.", order: 0 },
    { type: "image", assetId: "asset-id", alt: "測試圖片 & image", caption: "圖片說明", order: 1 },
    { type: "text", text: "中文翻譯。", order: 2 },
  ],
};

const asset: MaterialAssetRecord = {
  id: "asset-id",
  materialId: material.id,
  blob: new Blob([Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])], { type: "image/webp" }),
  mimeType: "image/webp",
  width: 800,
  height: 600,
  alt: "",
  caption: "",
};

describe("material export", () => {
  it("creates safe file names", () => {
    expect(safeMaterialFileName('  A/B: C*?  ', "txt")).toBe("A B C.txt");
    expect(safeMaterialFileName("CON", "docx")).toBe("英文學習教材.docx");
  });

  it("exports text-only materials as UTF-8 text", async () => {
    const textMaterial = {
      ...material,
      contentBlocks: material.contentBlocks.filter((block) => block.type === "text"),
    };
    const exported = await createMaterialExport(textMaterial, async () => undefined);
    expect(exported.fileName).toBe("圖文：教材 測試.txt");
    expect(exported.blob.type).toBe("text/plain;charset=utf-8");
    await expect(exported.blob.text()).resolves.toBe(material.content);
  });

  it("creates a DOCX package with ordered text, image, caption, and relationships", async () => {
    const exported = await createMaterialExport(material, async (assetId) => (
      assetId === asset.id ? asset : undefined
    ));
    expect(exported.fileName).toBe("圖文：教材 測試.docx");
    expect(exported.blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    const jsZip = await loadJsZip();
    const zip = await jsZip.loadAsync(await exported.blob.arrayBuffer());
    const documentXml = await zip.file("word/document.xml")?.async("text");
    const relationshipsXml = await zip.file("word/_rels/document.xml.rels")?.async("text");
    const imageBytes = await zip.file("word/media/image1.webp")?.async("uint8array");
    expect(documentXml).toContain("A first line.");
    expect(documentXml).toContain("Second line.");
    expect(documentXml).toContain("測試圖片 &amp; image");
    expect(documentXml).toContain("圖片說明");
    expect(relationshipsXml).toContain('Id="rIdImage1"');
    expect(imageBytes).toEqual(new Uint8Array(await asset.blob.arrayBuffer()));
  });

  it("rejects an image that does not belong to the material", async () => {
    await expect(createMaterialExport(material, async () => ({ ...asset, materialId: "other" })))
      .rejects.toThrow("圖片不存在或格式不正確");
  });
});
