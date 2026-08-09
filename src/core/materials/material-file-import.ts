import type { ContentBlock, MaterialAssetRecord } from "../models/models.js";

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

export const MATERIAL_FILE_ACCEPT = ".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface ImportedMaterialFile {
  assets: Array<Omit<MaterialAssetRecord, "materialId">>;
  content: string;
  contentBlocks?: ContentBlock[];
}

export async function readMaterialFile(
  file: File,
  onProgress: (status: string) => void = () => {},
): Promise<ImportedMaterialFile> {
  const lowerCaseName = file.name.toLocaleLowerCase();
  const isPdf = file.type === "application/pdf" || lowerCaseName.endsWith(".pdf");
  const isText = file.type === "text/plain" || lowerCaseName.endsWith(".txt");
  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || lowerCaseName.endsWith(".docx");

  if (isText) {
    if (file.size > MAX_TEXT_FILE_BYTES) throw new Error("TXT 檔案請控制在 2 MB 以內。");
    return { content: await file.text(), contentBlocks: undefined, assets: [] };
  }
  if (isDocx) {
    const { importDocx } = await import("../importers/docx-importer.js");
    return importDocx(file, onProgress);
  }
  if (!isPdf) throw new Error("只支援 UTF-8 TXT、文字型 PDF 或 DOCX。");

  onProgress("正在從 PDF 擷取文字…");
  const { extractPdfText } = await import("../importers/pdf-importer.js");
  return { content: await extractPdfText(file), contentBlocks: undefined, assets: [] };
}
