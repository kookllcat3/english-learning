import { describe, expect, it } from "vitest";
import {
  materialWithLearningProgress,
  mergeNewerRecords,
  newerRecord,
  synchronizeVocabularyRecords,
} from "../../../src/core/learning/learning-records.js";

describe("learning record conflict resolution", () => {
  it("keeps the record with the later update time", () => {
    const current = { id: "material", updatedAt: "2026-07-29T10:00:00.000Z" };
    const incoming = { id: "material", updatedAt: "2026-07-29T11:00:00.000Z" };

    expect(newerRecord(current, incoming)).toBe(incoming);
    expect(newerRecord(incoming, current)).toBe(incoming);
  });

  it("prefers an explicitly imported record when update times match", () => {
    const updatedAt = "2026-07-29T11:00:00.000Z";
    const current = { id: "material", knownWords: [], updatedAt };
    const incoming = { id: "material", knownWords: ["animal"], updatedAt };

    expect(newerRecord(current, incoming)).toBe(incoming);
  });

  it("merges records by key while preserving the newest version", () => {
    const current = [
      { id: "existing", value: "old", updatedAt: "2026-07-29T10:00:00.000Z" },
      { id: "local", value: "kept", updatedAt: "2026-07-29T12:00:00.000Z" },
    ];
    const incoming = [
      { id: "existing", value: "new", updatedAt: "2026-07-29T11:00:00.000Z" },
      { id: "added", value: "imported", updatedAt: "2026-07-29T09:00:00.000Z" },
    ];

    expect(mergeNewerRecords(current, incoming, "id")).toEqual([
      incoming[0],
      current[1],
      incoming[1],
    ]);
  });

  it("refreshes the count, words, and update time together", () => {
    const material = {
      id: "material",
      knownCount: 0,
      knownWords: [],
      updatedAt: "2026-07-28T10:00:00.000Z",
    };
    const updatedAt = "2026-07-29T11:00:00.000Z";

    expect(materialWithLearningProgress(material, ["animal", "bear"], updatedAt)).toEqual({
      id: "material",
      knownCount: 2,
      knownWords: ["animal", "bear"],
      updatedAt,
    });
  });

  it("creates vocabulary records for known words missing from an imported backup", () => {
    const updatedAt = "2026-07-29T11:00:00.000Z";

    expect(synchronizeVocabularyRecords([], new Set(["bear"]), updatedAt)).toEqual([{
      word: "bear",
      learned: true,
      learnedAt: updatedAt,
      createdAt: updatedAt,
      updatedAt,
    }]);
  });

  it("keeps vocabulary learned state aligned with all material records", () => {
    const updatedAt = "2026-07-29T11:00:00.000Z";
    const records = [
      { word: "bear", learned: false, learnedAt: null },
      { word: "fox", learned: true, learnedAt: "2026-07-28T11:00:00.000Z" },
    ];

    expect(synchronizeVocabularyRecords(records, new Set(["bear"]), updatedAt)).toEqual([
      { word: "bear", learned: true, learnedAt: updatedAt, updatedAt },
      { word: "fox", learned: false, learnedAt: null, updatedAt },
    ]);
  });
});
