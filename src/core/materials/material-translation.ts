import type { ContentBlock } from "../models/models.js";
import { classifyReadingContent } from "../learning/reading-content.js";

const MAX_TRANSLATION_LENGTH = 2_000;

interface TranslationTarget {
  source: StoredLineLocation;
  translations: StoredLineLocation[];
}

interface StoredLineLocation {
  blockIndex: number;
  lineIndex: number;
  paragraphIndex: number;
}

export interface MaterialTranslationUpdate {
  content: string;
  contentBlocks: ContentBlock[];
}

export function normalizedTranslationText(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("中文解釋不能留空。");
  if (normalized.length > MAX_TRANSLATION_LENGTH) {
    throw new Error(`中文解釋不能超過 ${MAX_TRANSLATION_LENGTH.toLocaleString()} 個字元。`);
  }
  return normalized.replace(/\n+/g, " ");
}

export function updateMaterialParagraphTranslation(
  blocks: ContentBlock[],
  paragraphKey: string,
  text: string,
): MaterialTranslationUpdate {
  const translation = normalizedTranslationText(text);
  const target = translationTarget(blocks, paragraphKey);
  const contentBlocks = structuredClone(blocks);
  const sortedBlocks = [...contentBlocks].sort((first, second) => first.order - second.order);
  if (target.translations.length > 0) {
    target.translations.slice(1).reverse().forEach((location) => {
      removeStoredLine(sortedBlocks, location);
    });
    replaceStoredLine(sortedBlocks, target.translations[0], translation);
  } else {
    insertStoredLineAfter(sortedBlocks, target.source, translation);
  }

  const retainedBlocks = contentBlocks.filter((candidate) => (
    candidate.type !== "text" || candidate.text.trim().length > 0
  ));
  return {
    content: retainedBlocks
      .filter((candidate): candidate is Extract<ContentBlock, { type: "text" }> => (
        candidate.type === "text"
      ))
      .sort((first, second) => first.order - second.order)
      .map((candidate) => candidate.text)
      .join("\n\n"),
    contentBlocks: retainedBlocks,
  };
}

function translationTarget(blocks: ContentBlock[], paragraphKey: string): TranslationTarget {
  const section = classifyReadingContent(blocks).find((candidate) => (
    candidate.type === "text" && candidate.role === "source" && candidate.key === paragraphKey
  ));
  if (!section || section.type !== "text") throw new Error("找不到指定的英文段落。");
  const sourceLine = section.lines.filter((line) => line.role === "source").at(-1);
  if (!sourceLine) throw new Error("找不到指定的英文段落。");
  const sourceLocation = storedLineLocation(sourceLine.key);
  const translations = section.lines
    .filter((line) => line.role === "translation")
    .map((line) => storedLineLocation(line.key));
  return { source: sourceLocation, translations };
}

function storedLineLocation(lineKey: string): StoredLineLocation {
  const parts = lineKey.split("-").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error("英文段落識別碼無效。");
  }
  return { blockIndex: parts[1], paragraphIndex: parts[2], lineIndex: parts[3] };
}

function storedLines(blocks: ContentBlock[], location: StoredLineLocation): {
  block: Extract<ContentBlock, { type: "text" }>;
  lines: string[];
  paragraphs: string[];
} {
  const block = blocks[location.blockIndex];
  if (!block || block.type !== "text") throw new Error("找不到指定的英文段落。");
  const paragraphs = splitStoredParagraphs(block.text);
  const lines = paragraphs[location.paragraphIndex]?.split("\n");
  if (!lines || location.lineIndex >= lines.length) throw new Error("找不到指定的英文段落。");
  return { block, lines, paragraphs };
}

function saveStoredLines(
  block: Extract<ContentBlock, { type: "text" }>,
  lines: string[],
  paragraphs: string[],
  paragraphIndex: number,
): void {
  paragraphs[paragraphIndex] = lines.join("\n");
  block.text = paragraphs.join("\n\n");
}

function replaceStoredLine(blocks: ContentBlock[], location: StoredLineLocation, text: string): void {
  const { block, lines, paragraphs } = storedLines(blocks, location);
  lines[location.lineIndex] = text;
  saveStoredLines(block, lines, paragraphs, location.paragraphIndex);
}

function removeStoredLine(blocks: ContentBlock[], location: StoredLineLocation): void {
  const { block, lines, paragraphs } = storedLines(blocks, location);
  lines.splice(location.lineIndex, 1);
  saveStoredLines(block, lines, paragraphs, location.paragraphIndex);
}

function insertStoredLineAfter(
  blocks: ContentBlock[],
  location: StoredLineLocation,
  text: string,
): void {
  const { block, lines, paragraphs } = storedLines(blocks, location);
  lines.splice(location.lineIndex + 1, 0, text);
  saveStoredLines(block, lines, paragraphs, location.paragraphIndex);
}

function splitStoredParagraphs(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
}
