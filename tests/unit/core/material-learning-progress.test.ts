import { describe, expect, it } from "vitest";
import {
  materialLearningProgressState,
  type ReadingParagraphUpdate,
} from "../../../src/core/materials/material-learning-progress.js";
import type { MaterialRecord, VocabularyRecord } from "../../../src/core/models/models.js";

const updatedAt = "2026-08-09T04:00:00.000Z";

function material(overrides: Partial<MaterialRecord> = {}): MaterialRecord {
  return {
    id: "material",
    title: "Lesson",
    description: "",
    createdAt: "2026-08-08T04:00:00.000Z",
    updatedAt: "2026-08-08T04:00:00.000Z",
    wordCount: 4,
    knownCount: 1,
    knownWords: ["bear"],
    readingParagraphKey: "0-0-0",
    ...overrides,
  };
}

function state(
  words: string[],
  readingParagraphUpdate: ReadingParagraphUpdate = { mode: "preserve" },
  vocabulary: Array<VocabularyRecord | undefined> = [],
) {
  return materialLearningProgressState(
    material(),
    ["the", "bear", "runs", "sleeps"],
    words,
    vocabulary,
    readingParagraphUpdate,
    updatedAt,
  );
}

describe("material learning progress", () => {
  it("adds unique material words in material order and marks vocabulary learned", () => {
    const existingRecord = {
      word: "runs",
      learned: false,
      learnedAt: null,
      createdAt: "2026-08-08T04:00:00.000Z",
    };

    expect(state(["RUNS", "the", "runs"], { mode: "set", paragraphKey: "0-0-1" }, [
      existingRecord,
      undefined,
    ])).toEqual({
      material: {
        ...material(),
        knownCount: 3,
        knownWords: ["the", "bear", "runs"],
        readingParagraphKey: "0-0-1",
        updatedAt,
      },
      vocabulary: [
        { ...existingRecord, learned: true, learnedAt: updatedAt, updatedAt },
        { word: "the", learned: true, learnedAt: updatedAt, createdAt: updatedAt, updatedAt },
      ],
    });
  });

  it.each([
    [{ mode: "preserve" } as const, "0-0-0"],
    [{ mode: "clear" } as const, null],
    [{ mode: "set", paragraphKey: "0-0-2" } as const, "0-0-2"],
  ])("supports an empty word set with a %s reading position update", (update, expectedKey) => {
    const result = state([], update);

    expect(result.material.readingParagraphKey).toBe(expectedKey);
    expect(result.material.knownWords).toEqual(["bear"]);
    expect(result.vocabulary).toEqual([]);
  });

  it("rejects a word outside the material term index", () => {
    expect(() => state(["forest"])).toThrow("指定的單字不屬於這份教材。");
  });
});
