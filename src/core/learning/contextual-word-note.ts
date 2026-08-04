import type { ContentBlock, WordNoteContext } from "../models/models.js";
import { isValidWord, normalizeWord } from "../text/text.js";
import {
  classifyReadingContent,
  readingWordOccurrencesForBlocks,
  sourceWordsForBlocks,
} from "./reading-content.js";

const CONTEXT_ID_SEPARATOR = "::";
const READING_OCCURRENCE_PREFIX = "reading:";
const VOCABULARY_OCCURRENCE_PREFIX = "vocabulary:";

export function contextualWordNoteId(
  context: Pick<WordNoteContext, "materialId" | "occurrenceKey">,
): string {
  return [context.materialId, context.occurrenceKey]
    .map((value) => encodeURIComponent(value))
    .join(CONTEXT_ID_SEPARATOR);
}

export function readingWordOccurrenceKey(wordKey: string): string {
  return `${READING_OCCURRENCE_PREFIX}${wordKey}`;
}

export function vocabularyWordOccurrenceKey(word: string): string {
  return `${VOCABULARY_OCCURRENCE_PREFIX}${normalizeWord(word)}`;
}

export function normalizedWordNoteContext(context: WordNoteContext): WordNoteContext {
  return {
    materialId: context.materialId.trim(),
    occurrenceKey: context.occurrenceKey.trim(),
    word: normalizeWord(context.word),
  };
}

export function isValidWordNoteContext(context: WordNoteContext): boolean {
  const normalized = normalizedWordNoteContext(context);
  return normalized.materialId.length > 0
    && normalized.occurrenceKey.length > 0
    && isValidWord(normalized.word);
}

export function isContextualOccurrenceValid(
  context: WordNoteContext,
  blocks: ContentBlock[],
): boolean {
  const normalized = normalizedWordNoteContext(context);
  if (!isValidWordNoteContext(normalized)) return false;
  if (normalized.occurrenceKey.startsWith(READING_OCCURRENCE_PREFIX)) {
    const wordKey = normalized.occurrenceKey.slice(READING_OCCURRENCE_PREFIX.length);
    return readingWordOccurrencesForBlocks(blocks)
      .some((occurrence) => occurrence.wordKey === wordKey && occurrence.word === normalized.word);
  }
  if (normalized.occurrenceKey.startsWith(VOCABULARY_OCCURRENCE_PREFIX)) {
    return normalized.occurrenceKey === vocabularyWordOccurrenceKey(normalized.word)
      && sourceWordsForBlocks(blocks).includes(normalized.word);
  }
  return isValidSelectionOccurrence(normalized, blocks);
}

function isValidSelectionOccurrence(context: WordNoteContext, blocks: ContentBlock[]): boolean {
  const match = /^selection:([^:]+):([^:]+):(\d+):(\d+)$/.exec(context.occurrenceKey);
  if (!match) return false;
  const [, paragraphKey, lineKey, startText, endText] = match;
  const start = Number(startText);
  const end = Number(endText);
  const section = classifyReadingContent(blocks).find((candidate) => (
    candidate.type === "text" && candidate.key === paragraphKey
  ));
  if (!section || section.type !== "text") return false;
  const line = section.lines.find((candidate) => candidate.role === "source" && candidate.key === lineKey);
  if (!line || start < 0 || end <= start || end > line.text.length) return false;
  return normalizeWord(line.text.slice(start, end)) === context.word;
}
