import type { ContentBlock } from "../models/models.js";
import { classifyReadingContent } from "./reading-content.js";

export { readingParagraphKey, splitReadingParagraphs } from "./reading-content.js";

export function hasReadingParagraphKey(value: string, blocks: ContentBlock[]): boolean {
  return classifyReadingContent(blocks).some((section) => (
    section.type === "text" && section.key === value
  ));
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
