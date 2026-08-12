import type {
  ContentBlock,
  ContextualWordNoteRecord,
  LegacyContextualWordNoteAnnotationRecord,
  MaterialAnnotationRecord,
  MaterialHighlightAnnotationRecord,
  MaterialHighlightColor,
} from "../models/models.js";
import { isContextualOccurrenceValid } from "./contextual-word-note.js";
import { readingWordOccurrencesForBlocks } from "./reading-content.js";

export const DEFAULT_HIGHLIGHT_COLOR: MaterialHighlightColor = "yellow";
export const MATERIAL_HIGHLIGHT_COLORS = [DEFAULT_HIGHLIGHT_COLOR] as const;

export function contextualWordNoteToMaterialAnnotation(
  note: ContextualWordNoteRecord,
): LegacyContextualWordNoteAnnotationRecord {
  return {
    id: note.id,
    materialId: note.materialId,
    kind: "legacy-contextual-word-note",
    target: {
      type: "contextual-word-occurrence",
      occurrenceKey: note.occurrenceKey,
      word: note.word,
    },
    body: {
      format: "markdown",
      value: note.markdown,
    },
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export function materialAnnotationToContextualWordNote(
  annotation: LegacyContextualWordNoteAnnotationRecord,
): ContextualWordNoteRecord {
  return {
    id: annotation.id,
    materialId: annotation.materialId,
    occurrenceKey: annotation.target.occurrenceKey,
    word: annotation.target.word,
    markdown: annotation.body.value,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
  };
}

export function isContextualWordNoteRecord(value: unknown): value is ContextualWordNoteRecord {
  if (!isRecord(value)) return false;
  return ["id", "materialId", "occurrenceKey", "word", "markdown", "createdAt", "updatedAt"]
    .every((key) => typeof value[key] === "string");
}

export function materialAnnotationsForReplacement(
  annotations: MaterialAnnotationRecord[],
  blocks: ContentBlock[],
  updatedAt: string,
): MaterialAnnotationRecord[] {
  const occurrenceOrder = new Map(
    readingWordOccurrencesForBlocks(blocks).map((occurrence, index) => [
      occurrence.wordKey,
      { index, paragraphKey: occurrence.paragraphKey },
    ]),
  );
  return annotations.reduce<MaterialAnnotationRecord[]>((retained, annotation) => {
    if (annotation.kind === "legacy-contextual-word-note") {
      const note = materialAnnotationToContextualWordNote(annotation);
      if (isContextualOccurrenceValid(note, blocks)) retained.push(annotation);
      return retained;
    }
    const orderedKeys = [...new Set(annotation.target.occurrenceKeys)]
      .filter((key) => occurrenceOrder.has(key))
      .sort((first, second) => (
        (occurrenceOrder.get(first)?.index ?? 0) - (occurrenceOrder.get(second)?.index ?? 0)
      ));
    const keysByParagraph = new Map<string, string[]>();
    orderedKeys.forEach((key) => {
      const paragraphKey = occurrenceOrder.get(key)?.paragraphKey;
      if (!paragraphKey) return;
      const keys = keysByParagraph.get(paragraphKey) ?? [];
      keys.push(key);
      keysByParagraph.set(paragraphKey, keys);
    });
    [...keysByParagraph].forEach(([paragraphKey, occurrenceKeys], index) => {
      const unchanged = keysByParagraph.size === 1
        && paragraphKey === annotation.target.paragraphKey
        && sameValues(occurrenceKeys, annotation.target.occurrenceKeys);
      retained.push(unchanged
        ? annotation
        : {
          ...annotation,
          id: index === 0 ? annotation.id : splitAnnotationId(annotation.id, paragraphKey, index),
          target: { ...annotation.target, paragraphKey, occurrenceKeys },
          updatedAt,
        });
    });
    return retained;
  }, []);
}

export function createMaterialHighlightAnnotation({
  materialId,
  occurrenceKey,
  paragraphKey,
  timestamp,
}: {
  materialId: string;
  occurrenceKey: string;
  paragraphKey: string;
  timestamp: string;
}): MaterialHighlightAnnotationRecord {
  return {
    id: crypto.randomUUID(),
    materialId,
    kind: "highlight",
    target: {
      type: "reading-word-occurrences",
      paragraphKey,
      occurrenceKeys: [occurrenceKey],
    },
    style: { color: DEFAULT_HIGHLIGHT_COLOR },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function addHighlightOccurrence(
  annotation: MaterialHighlightAnnotationRecord,
  occurrenceKey: string,
  orderedOccurrenceKeys: readonly string[],
  updatedAt: string,
): MaterialHighlightAnnotationRecord {
  const selected = new Set([...annotation.target.occurrenceKeys, occurrenceKey]);
  return {
    ...annotation,
    style: { ...annotation.style },
    target: {
      ...annotation.target,
      occurrenceKeys: orderedOccurrenceKeys.filter((key) => selected.has(key)),
    },
    updatedAt,
  };
}

export function removeHighlightOccurrence(
  annotation: MaterialHighlightAnnotationRecord,
  occurrenceKey: string,
  updatedAt: string,
): MaterialHighlightAnnotationRecord | null {
  const occurrenceKeys = annotation.target.occurrenceKeys.filter((key) => key !== occurrenceKey);
  return occurrenceKeys.length === 0
    ? null
    : {
      ...annotation,
      style: { ...annotation.style },
      target: { ...annotation.target, occurrenceKeys },
      updatedAt,
    };
}

function sameValues(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function splitAnnotationId(annotationId: string, paragraphKey: string, index: number): string {
  const input = `${annotationId}\u0000${paragraphKey}\u0000${index}`;
  const hex = [2166136261, 2246822519, 3266489917, 668265263]
    .map((seed) => stableHash(input, seed).toString(16).padStart(8, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function stableHash(value: string, seed: number): number {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
