import type { ContentBlock } from "../models/models.js";

export function splitReadingParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

export function readingParagraphKey(
  blockOrder: number,
  blockIndex: number,
  paragraphIndex: number,
): string {
  return `${blockOrder}-${blockIndex}-${paragraphIndex}`;
}

export function readingParagraphKeys(blocks: ContentBlock[]): Set<string> {
  const keys = new Set<string>();
  [...blocks]
    .sort((first, second) => first.order - second.order)
    .forEach((block, blockIndex) => {
      if (block.type !== "text") return;
      splitReadingParagraphs(block.text).forEach((_paragraph, paragraphIndex) => {
        keys.add(readingParagraphKey(block.order, blockIndex, paragraphIndex));
      });
    });
  return keys;
}

export function normalizedReadingParagraphKey(
  value: unknown,
  blocks: ContentBlock[],
): string | null {
  return typeof value === "string" && readingParagraphKeys(blocks).has(value)
    ? value
    : null;
}
