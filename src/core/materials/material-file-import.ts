import type { ContentBlock, MaterialAssetRecord } from "../models/models.js";

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

export const MATERIAL_FILE_ACCEPT = ".txt,text/plain";

export interface ImportedMaterialFile {
  assets: Array<Omit<MaterialAssetRecord, "materialId">>;
  content: string;
  contentBlocks?: ContentBlock[];
}

export async function readMaterialFile(
  file: File,
  _onProgress: (status: string) => void = () => {},
): Promise<ImportedMaterialFile> {
  const lowerCaseName = file.name.toLocaleLowerCase();
  const isText = file.type === "text/plain" || lowerCaseName.endsWith(".txt");

  if (isText) {
    if (file.size > MAX_TEXT_FILE_BYTES) throw new Error("TXT 檔案請控制在 2 MB 以內。");
    return { content: await file.text(), contentBlocks: undefined, assets: [] };
  }
  throw new Error("目前只支援 UTF-8 TXT 檔案或直接貼上文字。");
}
