import { describe, expect, it } from "vitest";

import {
  contextualWordNoteId,
  isContextualOccurrenceValid,
  isValidWordNoteContext,
  normalizedWordNoteContext,
  readingWordOccurrenceKey,
  vocabularyWordOccurrenceKey,
} from "../../../src/core/learning/contextual-word-note.js";

describe("contextual word notes", () => {
  const blocks = [{
    type: "text" as const,
    order: 0,
    text: "The driver waits.\n司機正在等待。\n\nThe driver leaves.\n司機離開了。",
  }];
  it("creates different ids for different materials and occurrences", () => {
    const first = contextualWordNoteId({ materialId: "material-a", occurrenceKey: "reading:1" });
    const second = contextualWordNoteId({ materialId: "material-a", occurrenceKey: "reading:2" });
    const third = contextualWordNoteId({ materialId: "material-b", occurrenceKey: "reading:1" });

    expect(new Set([first, second, third]).size).toBe(3);
  });

  it("escapes id parts so separators cannot collide", () => {
    expect(contextualWordNoteId({ materialId: "a::b", occurrenceKey: "c" }))
      .not.toBe(contextualWordNoteId({ materialId: "a", occurrenceKey: "b::c" }));
  });

  it("normalizes word context without changing its location", () => {
    expect(normalizedWordNoteContext({
      materialId: " material-a ",
      occurrenceKey: " reading:1 ",
      word: "Driver",
    })).toEqual({
      materialId: "material-a",
      occurrenceKey: "reading:1",
      word: "driver",
    });
  });

  it("builds stable reading and vocabulary occurrence keys", () => {
    expect(readingWordOccurrenceKey("3-0-5-0-12")).toBe("reading:3-0-5-0-12");
    expect(vocabularyWordOccurrenceKey("Driver")).toBe("vocabulary:driver");
  });

  it("rejects a context without a material, occurrence, or valid word", () => {
    expect(isValidWordNoteContext({ materialId: "", occurrenceKey: "reading:1", word: "driver" }))
      .toBe(false);
    expect(isValidWordNoteContext({ materialId: "material", occurrenceKey: "", word: "driver" }))
      .toBe(false);
    expect(isValidWordNoteContext({ materialId: "material", occurrenceKey: "reading:1", word: "123" }))
      .toBe(false);
  });

  it("validates reading and vocabulary occurrences against material content", () => {
    expect(isContextualOccurrenceValid({
      materialId: "material",
      occurrenceKey: "reading:0-0-0-0-2",
      word: "driver",
    }, blocks)).toBe(true);
    expect(isContextualOccurrenceValid({
      materialId: "material",
      occurrenceKey: "reading:0-0-1-0-2",
      word: "driver",
    }, blocks)).toBe(true);
    expect(isContextualOccurrenceValid({
      materialId: "material",
      occurrenceKey: "vocabulary:driver",
      word: "driver",
    }, blocks)).toBe(true);
    expect(isContextualOccurrenceValid({
      materialId: "material",
      occurrenceKey: "reading:0-0-9-0-2",
      word: "driver",
    }, blocks)).toBe(false);
  });
});
