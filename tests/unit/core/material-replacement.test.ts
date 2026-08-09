import { describe, expect, it } from "vitest";

import { materialReplacementState } from "../../../src/core/materials/material-replacement.js";
import type { MaterialRecord, VocabularyRecord } from "../../../src/core/models/models.js";

const updatedAt = "2026-08-08T12:00:00.000Z";
const currentMaterial: MaterialRecord = {
  id: "current",
  title: "Current material",
  description: "",
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-02T12:00:00.000Z",
  wordCount: 3,
  knownCount: 2,
  knownWords: ["bear", "fox"],
  readingParagraphKey: "0-0-1",
};

describe("material replacement learning state", () => {
  it("keeps only known words that remain in the replacement source", () => {
    const result = materialReplacementState(currentMaterial, ["bear", "owl"], [], [], updatedAt);

    expect(result.material).toEqual({
      ...currentMaterial,
      knownCount: 1,
      knownWords: ["bear"],
      readingParagraphKey: null,
      updatedAt,
      wordCount: 2,
    });
    expect(result.vocabulary).toEqual([{
      word: "bear",
      learned: true,
      learnedAt: updatedAt,
      createdAt: updatedAt,
      updatedAt,
    }]);
  });

  it("keeps a removed word learned when another material still knows it", () => {
    const otherMaterial: MaterialRecord = {
      ...currentMaterial,
      id: "other",
      knownCount: 1,
      knownWords: ["fox"],
    };
    const vocabulary: VocabularyRecord[] = [{
      word: "fox",
      learned: true,
      learnedAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    }];

    const result = materialReplacementState(
      currentMaterial,
      ["bear", "owl"],
      [otherMaterial],
      vocabulary,
      updatedAt,
    );

    expect(result.vocabulary.find((record) => record.word === "fox")?.learned).toBe(true);
  });

  it("retains a removed vocabulary record but clears learned when no material knows it", () => {
    const vocabulary: VocabularyRecord[] = [{
      word: "fox",
      learned: true,
      learnedAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    }];

    const result = materialReplacementState(currentMaterial, ["bear", "owl"], [], vocabulary, updatedAt);

    expect(result.vocabulary.find((record) => record.word === "fox")).toEqual({
      ...vocabulary[0],
      learned: false,
      learnedAt: null,
      updatedAt,
    });
  });
});
