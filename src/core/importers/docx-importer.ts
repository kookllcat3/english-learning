const MAX_DOCX_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1920;
const MAX_IMAGES = 50;
const RELATIONSHIP_NAMESPACE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

interface TextPart {
  type: "text";
  text: string;
}

interface ImagePart {
  type: "image";
  relationshipId?: string;
  assetId?: string;
  alt: string;
  caption?: string;
}

type ParagraphPart = TextPart | ImagePart;

export interface ImportedDocx {
  assets: Array<Omit<MaterialAssetRecord, "materialId">>;
  content: string;
  contentBlocks: ContentBlock[];
}

function childrenByLocalName(element: Element, name: string): Element[] {
  return [...element.children].filter((child) => child.localName === name);
}

function descendantsByLocalName(element: Element, name: string): Element[] {
  return [...element.getElementsByTagName("*")].filter((child) => child.localName === name);
}

function attributeByLocalName(element: Element, name: string): string {
  const attribute = [...element.attributes].find((item) => item.localName === name);
  return attribute?.value ?? "";
}

function parseXml(text: string, label: string): XMLDocument {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error(`DOCX 的 ${label} 格式不正確。`);
  return document;
}

function normalizeTarget(target: string): string {
  const parts: string[] = [];
  const relativeTarget = target.replace(/^\/+/, "");
  const rootedTarget = relativeTarget.startsWith("word/") ? relativeTarget : `word/${relativeTarget}`;
  rootedTarget.split("/").forEach((part) => {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  });
  return parts.join("/");
}

function mimeTypeForPath(path: string): string {
  const extension = path.split(".").pop()?.toLocaleLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return extension ? mimeTypes[extension] ?? "" : "";
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("此瀏覽器無法輸出 WebP。")),
      "image/webp",
      quality,
    );
  });
}

async function convertToWebp(
  source: Blob,
  label: string,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("此瀏覽器不支援 DOCX 圖片轉檔，請更新瀏覽器。");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`DOCX 圖片「${label}」無法解碼或格式不受支援。`);
  }
  try {
    let scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    let quality = 0.82;
    let blob: Blob | undefined;
    let width = bitmap.width;
    let height = bitmap.height;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      width = Math.max(1, Math.round(bitmap.width * scale));
      height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("無法建立 WebP 轉檔畫布。");
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await canvasBlob(canvas, quality);
      if (blob.size <= MAX_IMAGE_BYTES) break;
      if (quality > 0.56) quality -= 0.08;
      else scale *= 0.82;
    }
    if (!blob || blob.size > MAX_IMAGE_BYTES) {
      throw new Error(`DOCX 圖片「${label}」轉檔後仍超過 2 MB。`);
    }
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

function paragraphStyle(paragraph: Element): string {
  const properties = childrenByLocalName(paragraph, "pPr")[0];
  const style = properties && descendantsByLocalName(properties, "pStyle")[0];
  return style ? attributeByLocalName(style, "val") : "";
}

function imageReference(element: Element): ImagePart | null {
  const blip = element.localName === "blip"
    ? element
    : descendantsByLocalName(element, "blip")[0];
  if (!blip) return null;
  const relationshipId =
    blip.getAttributeNS(RELATIONSHIP_NAMESPACE, "embed") || attributeByLocalName(blip, "embed");
  if (!relationshipId) return null;
  let current: Element | null = blip;
  let docProperties: Element | undefined;
  while (current && !docProperties) {
    docProperties = descendantsByLocalName(current, "docPr")[0];
    current = current.parentElement;
  }
  return {
    type: "image",
    relationshipId,
    alt: docProperties?.getAttribute("descr")?.trim()
      || docProperties?.getAttribute("title")?.trim()
      || "",
  };
}

function paragraphParts(paragraph: Element): ParagraphPart[] {
  const parts: ParagraphPart[] = [];
  let text = "";
  const flushText = () => {
    const normalized = text.replace(/\s+\n/g, "\n").trim();
    if (normalized) parts.push({ type: "text", text: normalized });
    text = "";
  };
  const walk = (element: Element): void => {
    if (element.localName === "del") return;
    if (element.localName === "t") {
      text += element.textContent ?? "";
      return;
    }
    if (element.localName === "tab") {
      text += "\t";
      return;
    }
    if (element.localName === "br" || element.localName === "cr") {
      text += "\n";
      return;
    }
    if (element.localName === "drawing" || element.localName === "pict") {
      const reference = imageReference(element);
      if (reference) {
        flushText();
        parts.push(reference);
      }
      return;
    }
    [...element.children].forEach(walk);
  };
  [...paragraph.children].forEach(walk);
  flushText();
  return parts;
}

export async function importDocx(
  file: File,
  onProgress: (status: string) => void = () => {},
): Promise<ImportedDocx> {
  if (file.size > MAX_DOCX_BYTES) throw new Error("DOCX 原檔不可超過 30 MB。");
  if (!globalThis.JSZip) throw new Error("DOCX 解析元件未載入。");
  onProgress("讀取 DOCX…");
  let zip: JsZipArchive;
  try {
    zip = await globalThis.JSZip.loadAsync(file);
  } catch {
    throw new Error("DOCX 已損壞、受密碼保護或不是有效的 DOCX。");
  }
  if (zip.file("word/vbaProject.bin") || zip.file("EncryptionInfo")) {
    throw new Error("不支援含巨集或受密碼保護的 DOCX。");
  }
  const documentFile = zip.file("word/document.xml");
  const relationshipFile = zip.file("word/_rels/document.xml.rels");
  if (!documentFile || !relationshipFile) throw new Error("DOCX 缺少主文件或關聯資料。");

  onProgress("解析文字與圖片順序…");
  const [documentXml, relationshipXml] = await Promise.all([
    documentFile.async("text"),
    relationshipFile.async("text"),
  ]);
  const document = parseXml(documentXml, "主文件");
  const relationships = parseXml(relationshipXml, "關聯檔");
  const targets = new Map<string, string>();
  descendantsByLocalName(relationships.documentElement, "Relationship")
    .forEach((relationship) => {
      const id = relationship.getAttribute("Id");
      if (id) targets.set(id, normalizeTarget(relationship.getAttribute("Target") ?? ""));
    });
  const body = descendantsByLocalName(document.documentElement, "body")[0];
  if (!body) throw new Error("DOCX 缺少主文件內容。");

  const rawBlocks: ParagraphPart[] = [];
  childrenByLocalName(body, "p").forEach((paragraph) => {
    const parts = paragraphParts(paragraph);
    const isCaption = /caption/i.test(paragraphStyle(paragraph));
    if (isCaption && parts.length === 1 && parts[0]?.type === "text") {
      const previousImage = [...rawBlocks].reverse().find((block) => block.type === "image");
      if (previousImage && !previousImage.caption) {
        previousImage.caption = parts[0].text;
        if (!previousImage.alt) previousImage.alt = parts[0].text;
        return;
      }
    }
    rawBlocks.push(...parts);
  });
  const imageBlocks = rawBlocks.filter((block): block is ImagePart => block.type === "image");
  if (imageBlocks.length > MAX_IMAGES) throw new Error("每份 DOCX 最多可包含 50 張圖片。");
  if (!rawBlocks.some((block) => block.type === "text" && block.text.trim())) {
    throw new Error("DOCX 沒有可供學習的文字內容。");
  }

  const assets: Array<Omit<MaterialAssetRecord, "materialId">> = [];
  for (let index = 0; index < imageBlocks.length; index += 1) {
    const block = imageBlocks[index];
    const path = block.relationshipId ? targets.get(block.relationshipId) : undefined;
    const mimeType = path && mimeTypeForPath(path);
    if (!path || !mimeType) throw new Error(`第 ${index + 1} 張圖片格式不受支援。`);
    const media = zip.file(path);
    if (!media) throw new Error(`DOCX 缺少第 ${index + 1} 張圖片資料。`);
    onProgress(`圖片轉成 WebP（${index + 1}/${imageBlocks.length}）…`);
    const originalBlob = await media.async("blob");
    const converted = await convertToWebp(
      new Blob([originalBlob], { type: mimeType }),
      path.split("/").pop() ?? `圖片 ${index + 1}`,
    );
    const assetId = crypto.randomUUID();
    block.assetId = assetId;
    block.alt = block.alt || `素材圖片 ${index + 1}`;
    delete block.relationshipId;
    assets.push({
      id: assetId,
      blob: converted.blob,
      mimeType: "image/webp",
      width: converted.width,
      height: converted.height,
      alt: block.alt,
      caption: block.caption ?? "",
    });
  }
  const contentBlocks: ContentBlock[] = rawBlocks.map((block, index) => {
    if (block.type === "text") return { ...block, order: index };
    if (!block.assetId) throw new Error(`第 ${index + 1} 張圖片缺少識別碼。`);
    return {
      type: "image",
      assetId: block.assetId,
      alt: block.alt,
      caption: block.caption,
      order: index,
    };
  });
  const content = contentBlocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
  return { content, contentBlocks, assets };
}
import type {
  ContentBlock,
  MaterialAssetRecord,
} from "../models/models.js";
