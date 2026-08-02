import type { ContentBlock } from "../models/models.js";
import {
  classifyReadingContent,
  readingParagraphKey,
  splitReadingParagraphs,
} from "./reading-content.js";

export { readingParagraphKey, splitReadingParagraphs } from "./reading-content.js";

export function hasReadingParagraphKey(value: string, blocks: ContentBlock[]): boolean {
  return [...blocks]
    .sort((first, second) => first.order - second.order)
    .some((block, blockIndex) => block.type === "text"
      && splitReadingParagraphs(block.text).some((_paragraph, paragraphIndex) => (
        readingParagraphKey(block.order, blockIndex, paragraphIndex) === value
      )));
}

export function readingParagraphKeys(blocks: ContentBlock[]): Set<string> {
  return new Set(classifyReadingContent(blocks)
    .filter((section) => section.type === "text" && section.role === "source")
    .map((section) => section.key));
}

export function normalizedReadingParagraphKey(
  value: unknown,
  blocks: ContentBlock[],
): string | null {
  return typeof value === "string" && readingParagraphKeys(blocks).has(value)
    ? value
    : null;
}
