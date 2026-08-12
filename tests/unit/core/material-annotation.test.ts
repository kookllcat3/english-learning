import { describe, expect, it } from "vitest";

import {
  addHighlightOccurrence,
  contextualWordNoteToMaterialAnnotation,
  createMaterialHighlightAnnotation,
  materialAnnotationToContextualWordNote,
  materialAnnotationsForReplacement,
  removeHighlightOccurrence,
} from "../../../src/core/learning/material-annotation.js";
import { readingWordOccurrencesForBlocks } from "../../../src/core/learning/reading-content.js";
import type {
  ContentBlock,
  ContextualWordNoteRecord,
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

  it("splits a legacy highlight when paragraph classification changes", () => {
    const secondParagraph = occurrences.find((occurrence) => (
      occurrence.paragraphKey !== firstParagraph
    ))?.paragraphKey;
    expect(secondParagraph).toBeDefined();
    const secondParagraphOccurrence = occurrences.find((occurrence) => (
      occurrence.paragraphKey === secondParagraph
    ))?.wordKey;
    expect(secondParagraphOccurrence).toBeDefined();
    const annotation: MaterialHighlightAnnotationRecord = {
      id: "3dfda922-01f4-48bd-a62e-dc5bdb621050",
      materialId: "material",
      kind: "highlight",
      target: {
        type: "reading-word-occurrences",
        paragraphKey: firstParagraph,
        occurrenceKeys: [firstParagraphOccurrences[0], secondParagraphOccurrence!],
      },
      style: { color: "yellow" },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const repaired = materialAnnotationsForReplacement(
      [annotation],
      blocks,
      "2026-08-09T09:00:00.000Z",
    );
    expect(repaired).toHaveLength(2);
    const repairedHighlights = repaired.filter((record): record is MaterialHighlightAnnotationRecord => (
      record.kind === "highlight"
    ));
    expect(repairedHighlights.map((record) => record.target.paragraphKey)).toEqual([
      firstParagraph,
      secondParagraph,
    ]);
    expect(new Set(repairedHighlights.map((record) => record.id))).toHaveLength(2);
    expect(repairedHighlights[1].id).toMatch(/^[0-9a-f-]{36}$/);
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

});
