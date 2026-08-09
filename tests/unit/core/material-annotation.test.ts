import { describe, expect, it } from "vitest";

import {
  addHighlightOccurrence,
  contextualWordNoteToMaterialAnnotation,
  createMaterialHighlightAnnotation,
  mergeImportedMaterialAnnotations,
  materialAnnotationToContextualWordNote,
  materialAnnotationsForReplacement,
  removeHighlightOccurrence,
} from "../../../src/core/learning/material-annotation.js";
import { readingWordOccurrencesForBlocks } from "../../../src/core/learning/reading-content.js";
import type {
  ContentBlock,
  ContextualWordNoteRecord,
  LegacyContextualWordNoteAnnotationRecord,
  MaterialAnnotationRecord,
  MaterialHighlightAnnotationRecord,
} from "../../../src/core/models/models.js";

const blocks: ContentBlock[] = [{
  type: "text",
  order: 0,
  text: "The driver waits.\n司機正在等待。\n\nThe driver leaves.\n司機離開了。",
}];
const occurrences = readingWordOccurrencesForBlocks(blocks);
const firstParagraph = occurrences[0].paragraphKey;
const firstParagraphOccurrences = occurrences
  .filter((occurrence) => occurrence.paragraphKey === firstParagraph)
  .map((occurrence) => occurrence.wordKey);
const timestamp = "2026-08-09T08:00:00.000Z";

function highlight(
  id: string,
  materialId: string,
  occurrenceKey: string,
): MaterialHighlightAnnotationRecord {
  return {
    id,
    materialId,
    kind: "highlight",
    target: {
      type: "reading-word-occurrences",
      paragraphKey: firstParagraph,
      occurrenceKeys: [occurrenceKey],
    },
    style: { color: "yellow" },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("material annotations", () => {
  it("converts legacy contextual notes without losing data", () => {
    const note: ContextualWordNoteRecord = {
      id: "material::reading%3A0-0-0-0-2",
      materialId: "material",
      occurrenceKey: "reading:0-0-0-0-2",
      word: "driver",
      markdown: "Used as a noun.",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    expect(materialAnnotationToContextualWordNote(
      contextualWordNoteToMaterialAnnotation(note),
    )).toEqual(note);
  });

  it("orders and prunes highlight occurrences when material content changes", () => {
    const annotation: MaterialHighlightAnnotationRecord = {
      id: "3dfda922-01f4-48bd-a62e-dc5bdb621050",
      materialId: "material",
      kind: "highlight",
      target: {
        type: "reading-word-occurrences",
        paragraphKey: firstParagraph,
        occurrenceKeys: [
          firstParagraphOccurrences[2],
          "missing-occurrence",
          firstParagraphOccurrences[0],
          firstParagraphOccurrences[0],
        ],
      },
      style: { color: "yellow" },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    expect(materialAnnotationsForReplacement(
      [annotation],
      blocks,
      "2026-08-09T09:00:00.000Z",
    )).toEqual([{
      ...annotation,
      target: {
        ...annotation.target,
        occurrenceKeys: [firstParagraphOccurrences[0], firstParagraphOccurrences[2]],
      },
      updatedAt: "2026-08-09T09:00:00.000Z",
    }]);
  });

  it("creates, extends and clears an occurrence-backed highlight", () => {
    const annotation = createMaterialHighlightAnnotation({
      materialId: "material",
      paragraphKey: firstParagraph,
      occurrenceKey: firstParagraphOccurrences[0],
      timestamp,
    });
    const extended = addHighlightOccurrence(
      annotation,
      firstParagraphOccurrences[2],
      firstParagraphOccurrences,
      "2026-08-09T08:30:00.000Z",
    );

    expect(extended.target.occurrenceKeys).toEqual([
      firstParagraphOccurrences[0],
      firstParagraphOccurrences[2],
    ]);
    expect(extended.style).not.toBe(annotation.style);
    const remaining = removeHighlightOccurrence(
      extended,
      firstParagraphOccurrences[0],
      "2026-08-09T08:45:00.000Z",
    );
    expect(remaining?.target.occurrenceKeys).toEqual([firstParagraphOccurrences[2]]);
    expect(remaining?.style).not.toBe(extended.style);
    expect(removeHighlightOccurrence(
      remaining!,
      firstParagraphOccurrences[2],
      "2026-08-09T09:00:00.000Z",
    )).toBeNull();
  });

  it("uses imported highlights as the complete set for included materials", () => {
    const localIncludedHighlight = highlight(
      "local-included",
      "included-material",
      firstParagraphOccurrences[0],
    );
    const localUnrelatedHighlight = highlight(
      "local-unrelated",
      "unrelated-material",
      firstParagraphOccurrences[0],
    );
    const importedHighlight = highlight(
      "imported-included",
      "included-material",
      firstParagraphOccurrences[2],
    );

    expect(mergeImportedMaterialAnnotations(
      [localIncludedHighlight, localUnrelatedHighlight],
      [importedHighlight],
      new Set(["included-material"]),
    )).toEqual([localUnrelatedHighlight, importedHighlight]);
    expect(mergeImportedMaterialAnnotations(
      [localIncludedHighlight, localUnrelatedHighlight],
      [],
      new Set(["included-material"]),
    )).toEqual([localUnrelatedHighlight]);
  });

  it("keeps legacy annotations on recency merge and old-schema highlights intact", () => {
    const currentNote: LegacyContextualWordNoteAnnotationRecord = {
      id: "shared-note",
      materialId: "material",
      kind: "legacy-contextual-word-note",
      target: {
        type: "contextual-word-occurrence",
        occurrenceKey: firstParagraphOccurrences[0],
        word: "driver",
      },
      body: { format: "markdown", value: "newer local note" },
      createdAt: timestamp,
      updatedAt: "2026-08-09T10:00:00.000Z",
    };
    const incomingNote: LegacyContextualWordNoteAnnotationRecord = {
      ...currentNote,
      body: { format: "markdown", value: "older imported note" },
      updatedAt: "2026-08-09T09:00:00.000Z",
    };
    const localHighlight = highlight(
      "local-highlight",
      "material",
      firstParagraphOccurrences[0],
    );
    const annotations: MaterialAnnotationRecord[] = [currentNote, localHighlight];

    expect(mergeImportedMaterialAnnotations(
      annotations,
      [incomingNote],
      new Set(),
    )).toEqual([currentNote, localHighlight]);
  });
});
