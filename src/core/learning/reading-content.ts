import type { ContentBlock } from "../models/models.js";
import { extractUniqueWords } from "../text/text.js";

export type ReadingTextRole = "source" | "translation" | "mixed-reference" | "heading";

export interface ReadingTextLine {
  interactiveTextStart: number;
  key: string;
  role: ReadingTextRole;
  text: string;
}

export interface ReadingTextSection {
  key: string;
  lines: ReadingTextLine[];
  role: ReadingTextRole;
  type: "text";
  words: string[];
}

export interface ReadingImageSection {
  block: Extract<ContentBlock, { type: "image" }>;
  key: string;
  type: "image";
}

export type ReadingContentSection = ReadingTextSection | ReadingImageSection;

export interface ReadingWordOccurrence {
  lineKey: string;
  paragraphKey: string;
  word: string;
  wordKey: string;
}

interface ParagraphCandidate {
  key: string;
  lines: Array<{ key: string; text: string }>;
}

const CJK_PATTERN = /[\u3400-\u9fff]/u;
const ENGLISH_WORD_PATTERN = /[a-z]+(?:['’][a-z]+)*/gi;
const SOURCE_MARKER_PATTERN = /^(\s*EN(?:\s*[:：·|—-])?\s+)(?=[a-z])/i;
const ENGLISH_REFERENCE_PREFIX_PATTERN = /^\s*(?:WORD\s+POWER|VOCABULARY|KEY\s+WORDS?|GRAMMAR|LANGUAGE\s+NOTE|NOTE|TIP)\b/i;
const CHINESE_REFERENCE_PREFIX_PATTERN = /^\s*(?:學習方法|單字補充|文法補充)(?=\s|[:：]|$)/u;
const NUMBERED_BILINGUAL_LABEL_PATTERN = /^\s*\d{1,3}\s+[a-z][^.!?\n]*[\u3400-\u9fff]/i;
const TITLE_MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with",
]);

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

function sourceTextStart(text: string): number {
  return SOURCE_MARKER_PATTERN.exec(text)?.[1].length ?? 0;
}

function englishWords(text: string): string[] {
  return text.match(ENGLISH_WORD_PATTERN) ?? [];
}

function isReferenceText(text: string): boolean {
  return ENGLISH_REFERENCE_PREFIX_PATTERN.test(text)
    || CHINESE_REFERENCE_PREFIX_PATTERN.test(text)
    || NUMBERED_BILINGUAL_LABEL_PATTERN.test(text);
}

function isAllCapsLabel(text: string): boolean {
  const letters = text.replace(/[^a-z]/gi, "");
  return letters.length > 1 && letters === letters.toUpperCase();
}

function isTitleCaseLabel(words: string[]): boolean {
  if (words.length < 2 || words.length > 6) return false;
  return words.every((word, index) => (
    /^[A-Z]/.test(word)
    || (index > 0 && TITLE_MINOR_WORDS.has(word.toLocaleLowerCase("en")))
  ));
}

function hasSentencePunctuation(text: string): boolean {
  return /[.!?](?:[”"')\]]|\s)*$/u.test(text.trim());
}

function isSourceText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || CJK_PATTERN.test(trimmed) || isReferenceText(trimmed)) return false;
  const words = englishWords(trimmed);
  if (words.length === 0 || isAllCapsLabel(trimmed)) return false;
  if (sourceTextStart(text) > 0) return words.length > 1;
  if (words.length === 1) return true;
  if (hasSentencePunctuation(trimmed)) return true;
  return !isTitleCaseLabel(words);
}

function isDirectChineseTranslation(text: string): boolean {
  const trimmed = text.trim();
  return Boolean(trimmed) && CJK_PATTERN.test(trimmed) && !isReferenceText(trimmed);
}

function paragraphCandidates(
  block: Extract<ContentBlock, { type: "text" }>,
  blockIndex: number,
): ParagraphCandidate[] {
  return splitReadingParagraphs(block.text).map((paragraph, paragraphIndex) => {
    const key = readingParagraphKey(block.order, blockIndex, paragraphIndex);
    return {
      key,
      lines: paragraph.split("\n").map((text, lineIndex) => ({
        key: `${key}-${lineIndex}`,
        text,
      })),
    };
  });
}

function sourceSection(candidate: ParagraphCandidate): ReadingTextSection | null {
  const firstSourceLine = candidate.lines.findIndex((line) => isSourceText(line.text));
  if (firstSourceLine < 0) return null;
  const hasOnlyWhitespaceBeforeSource = candidate.lines
    .slice(0, firstSourceLine)
    .every((line) => !line.text.trim());
  if (!hasOnlyWhitespaceBeforeSource) return null;

  let reachedTranslation = false;
  const lines = candidate.lines.map((line) => {
    if (!reachedTranslation && isSourceText(line.text)) {
      return {
        interactiveTextStart: sourceTextStart(line.text),
        key: line.key,
        role: "source" as const,
        text: line.text,
      };
    }
    if (CJK_PATTERN.test(line.text) && !isReferenceText(line.text)) reachedTranslation = true;
    return {
      interactiveTextStart: 0,
      key: line.key,
      role: reachedTranslation && isDirectChineseTranslation(line.text)
        ? "translation" as const
        : "mixed-reference" as const,
      text: line.text,
    };
  });
  const sourceText = lines
    .filter((line) => line.role === "source")
    .map((line) => line.text.slice(line.interactiveTextStart))
    .join("\n");
  return {
    key: candidate.key,
    lines,
    role: "source",
    type: "text",
    words: extractUniqueWords(sourceText),
  };
}

function nonSourceSection(candidate: ParagraphCandidate): ReadingTextSection {
  const text = candidate.lines.map((line) => line.text).join("\n");
  const role: ReadingTextRole = CJK_PATTERN.test(text) || isReferenceText(text)
    ? "mixed-reference"
    : "heading";
  return {
    key: candidate.key,
    lines: candidate.lines.map((line) => ({
      interactiveTextStart: 0,
      key: line.key,
      role,
      text: line.text,
    })),
    role,
    type: "text",
    words: [],
  };
}

function attachTranslation(
  sections: ReadingContentSection[],
  candidate: ParagraphCandidate,
): boolean {
  const previous = sections.at(-1);
  if (!previous || previous.type !== "text" || previous.role !== "source") return false;
  if (!candidate.lines.every((line) => isDirectChineseTranslation(line.text))) return false;
  previous.lines.push(...candidate.lines.map((line) => ({
    interactiveTextStart: 0,
    key: line.key,
    role: "translation" as const,
    text: line.text,
  })));
  return true;
}

export function classifyReadingContent(blocks: ContentBlock[]): ReadingContentSection[] {
  const sections: ReadingContentSection[] = [];
  [...blocks]
    .sort((first, second) => first.order - second.order)
    .forEach((block, blockIndex) => {
      if (block.type === "image") {
        sections.push({ block, key: `${block.order}-${blockIndex}`, type: "image" });
        return;
      }
      paragraphCandidates(block, blockIndex).forEach((candidate) => {
        const source = sourceSection(candidate);
        if (source) {
          sections.push(source);
          return;
        }
        if (!attachTranslation(sections, candidate)) {
          sections.push(nonSourceSection(candidate));
        }
      });
    });
  return sections;
}

export function sourceWordsForBlocks(blocks: ContentBlock[]): string[] {
  return [...new Set(classifyReadingContent(blocks)
    .filter((section): section is ReadingTextSection => (
      section.type === "text" && section.role === "source"
    ))
    .flatMap((section) => section.words))]
    .sort((first, second) => first.localeCompare(second));
}

function lineWordOccurrences(
  paragraphKey: string,
  line: ReadingTextLine,
): ReadingWordOccurrence[] {
  if (line.role !== "source") return [];
  const occurrences: ReadingWordOccurrence[] = [];
  const interactiveText = line.text.slice(line.interactiveTextStart);
  const wordPattern = new RegExp(ENGLISH_WORD_PATTERN.source, ENGLISH_WORD_PATTERN.flags);
  let segmentIndex = line.interactiveTextStart > 0 ? 1 : 0;
  let cursor = 0;
  for (const match of interactiveText.matchAll(wordPattern)) {
    if (match.index > cursor) segmentIndex += 1;
    occurrences.push({
      lineKey: line.key,
      paragraphKey,
      word: match[0].toLocaleLowerCase("en"),
      wordKey: `${line.key}-${segmentIndex}`,
    });
    segmentIndex += 1;
    cursor = match.index + match[0].length;
  }
  return occurrences;
}

export function readingWordOccurrencesForBlocks(blocks: ContentBlock[]): ReadingWordOccurrence[] {
  return classifyReadingContent(blocks).flatMap((section) => (
    section.type === "text"
      ? section.lines.flatMap((line) => lineWordOccurrences(section.key, line))
      : []
  ));
}
