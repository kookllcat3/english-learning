import { splitReadingParagraphs } from "../learning/reading-content.js";
import { loadJsZip } from "../services/jszip-loader.js";
import type { BackupMaterial, MaterialAssetRecord } from "../models/models.js";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DOCX_IMAGE_WIDTH_PX = 624;
const EMUS_PER_PIXEL = 9_525;
const INVALID_FILE_NAME_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_FILE_NAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export interface MaterialExportFile {
  blob: Blob;
  fileName: string;
}

type AssetLoader = (assetId: string) => Promise<MaterialAssetRecord | undefined>;

interface ExportedImage {
  asset: MaterialAssetRecord;
  relationshipId: string;
  path: string;
}

function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function xmlAttribute(value: string): string {
  return xmlText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function safeMaterialFileName(title: string, extension: "docx" | "txt"): string {
  const cleaned = title
    .replace(INVALID_FILE_NAME_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 100);
  const baseName = !cleaned || RESERVED_FILE_NAME_PATTERN.test(cleaned)
    ? "英文學習教材"
    : cleaned;
  return `${baseName}.${extension}`;
}

function textRun(text: string): string {
  return `<w:r><w:t xml:space="preserve">${xmlText(text)}</w:t></w:r>`;
}

function textParagraph(text: string, style?: string): string {
  const lines = text.split("\n");
  const content = lines.map((line, index) => (
    `${index > 0 ? "<w:r><w:br/></w:r>" : ""}${textRun(line)}`
  )).join("");
  const properties = style ? `<w:pPr><w:pStyle w:val="${xmlAttribute(style)}"/></w:pPr>` : "";
  return `<w:p>${properties}${content}</w:p>`;
}

function imageSize(asset: MaterialAssetRecord): { width: number; height: number } {
  const scale = Math.min(1, MAX_DOCX_IMAGE_WIDTH_PX / Math.max(1, asset.width));
  return {
    width: Math.max(1, Math.round(asset.width * scale * EMUS_PER_PIXEL)),
    height: Math.max(1, Math.round(asset.height * scale * EMUS_PER_PIXEL)),
  };
}

function imageParagraph(image: ExportedImage, imageIndex: number): string {
  const { asset, relationshipId, path } = image;
  const { width, height } = imageSize(asset);
  const alt = xmlAttribute(asset.alt?.trim() || `教材圖片 ${imageIndex}`);
  const name = xmlAttribute(path.split("/").at(-1) ?? `image${imageIndex}.webp`);
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">`
    + `<wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${imageIndex}" name="${name}" descr="${alt}"/>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic><pic:nvPicPr><pic:cNvPr id="${imageIndex}" name="${name}" descr="${alt}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
    + "</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>";
}

function contentTypesXml(hasImages: boolean): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + (hasImages ? `<Default Extension="webp" ContentType="image/webp"/>` : "")
    + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
    + `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
    + "</Types>";
}

function packageRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
    + "</Relationships>";
}

function documentRelationshipsXml(images: ExportedImage[]): string {
  const imageRelationships = images.map(({ path, relationshipId }) => (
    `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${xmlAttribute(path.split("/").at(-1) ?? "")}"/>`
  )).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + imageRelationships
    + "</Relationships>";
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>`
    + `<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/></w:style>`
    + "</w:styles>";
}

function documentXml(material: BackupMaterial, imagesByAssetId: Map<string, ExportedImage>): string {
  const body = [...material.contentBlocks]
    .sort((first, second) => first.order - second.order)
    .flatMap((block) => {
      if (block.type === "text") {
        return splitReadingParagraphs(block.text).map((paragraph) => textParagraph(paragraph));
      }
      const image = imagesByAssetId.get(block.assetId);
      if (!image) throw new Error("教材圖片資料不完整，無法匯出 DOCX。");
      const paragraphs = [imageParagraph(image, Number(image.relationshipId.replace("rIdImage", "")))];
      const caption = block.caption?.trim() || image.asset.caption?.trim();
      if (caption) paragraphs.push(textParagraph(caption, "Caption"));
      return paragraphs;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" `
    + `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" `
    + `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" `
    + `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" `
    + `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>`
    + "</w:document>";
}

async function exportedImages(
  material: BackupMaterial,
  loadAsset: AssetLoader,
): Promise<ExportedImage[]> {
  const imageBlocks = [...material.contentBlocks]
    .sort((first, second) => first.order - second.order)
    .filter((block) => block.type === "image");
  return Promise.all(imageBlocks.map(async (block, index) => {
    const asset = await loadAsset(block.assetId);
    if (!asset || asset.materialId !== material.id || asset.mimeType !== "image/webp") {
      throw new Error(`教材第 ${index + 1} 張圖片不存在或格式不正確。`);
    }
    return {
      asset: {
        ...asset,
        alt: block.alt?.trim() || asset.alt,
        caption: block.caption?.trim() || asset.caption,
      },
      relationshipId: `rIdImage${index + 1}`,
      path: `word/media/image${index + 1}.webp`,
    };
  }));
}

async function createDocx(material: BackupMaterial, loadAsset: AssetLoader): Promise<Blob> {
  const images = await exportedImages(material, loadAsset);
  const imagesByAssetId = new Map(images.map((image) => [image.asset.id, image]));
  const JsZip = await loadJsZip();
  const zip = new JsZip();
  zip.file("[Content_Types].xml", contentTypesXml(images.length > 0));
  zip.file("_rels/.rels", packageRelationshipsXml());
  zip.file("word/document.xml", documentXml(material, imagesByAssetId));
  zip.file("word/styles.xml", stylesXml());
  zip.file("word/_rels/document.xml.rels", documentRelationshipsXml(images));
  await Promise.all(images.map(async ({ asset, path }) => {
    zip.file(path, new Uint8Array(await asset.blob.arrayBuffer()), { binary: true });
  }));
  const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return new Blob([archive], { type: DOCX_MIME_TYPE });
}

export async function createMaterialExport(
  material: BackupMaterial,
  loadAsset: AssetLoader,
): Promise<MaterialExportFile> {
  const hasImages = material.contentBlocks.some((block) => block.type === "image");
  if (!hasImages) {
    return {
      blob: new Blob([material.content], { type: "text/plain;charset=utf-8" }),
      fileName: safeMaterialFileName(material.title, "txt"),
    };
  }
  return {
    blob: await createDocx(material, loadAsset),
    fileName: safeMaterialFileName(material.title, "docx"),
  };
}
