import type {
  ContentBlock,
  ContextualWordNoteRecord,
  LegacyContextualWordNoteAnnotationRecord,
  MaterialAnnotationRecord,
  MaterialHighlightAnnotationRecord,
  MaterialHighlightColor,
} from "../models/models.js";
import { isContextualOccurrenceValid } from "./contextual-word-note.js";
import { mergeNewerRecords } from "./learning-records.js";
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
    const occurrenceKeys = [...new Set(annotation.target.occurrenceKeys)]
      .filter((key) => occurrenceOrder.get(key)?.paragraphKey === annotation.target.paragraphKey)
      .sort((first, second) => (
        (occurrenceOrder.get(first)?.index ?? 0) - (occurrenceOrder.get(second)?.index ?? 0)
      ));
    if (occurrenceKeys.length === 0) return retained;
    retained.push(sameValues(occurrenceKeys, annotation.target.occurrenceKeys)
      ? annotation
      : {
        ...annotation,
        target: { ...annotation.target, occurrenceKeys },
        updatedAt,
      });
    return retained;
  }, []);
}

export function mergeImportedMaterialAnnotations(
  current: MaterialAnnotationRecord[],
  incoming: MaterialAnnotationRecord[],
  materialsWithAuthoritativeHighlights: ReadonlySet<string>,
): MaterialAnnotationRecord[] {
  const legacyAnnotations = mergeNewerRecords(
    current.filter((annotation) => annotation.kind === "legacy-contextual-word-note"),
    incoming.filter((annotation) => annotation.kind === "legacy-contextual-word-note"),
    "id",
  );
  const retainedHighlights = current.filter((annotation) => (
    annotation.kind === "highlight"
      && !materialsWithAuthoritativeHighlights.has(annotation.materialId)
  ));
  const importedHighlights = incoming.filter((annotation) => annotation.kind === "highlight");
  return [...legacyAnnotations, ...retainedHighlights, ...importedHighlights];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
