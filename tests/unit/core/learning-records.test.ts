import { describe, expect, it } from "vitest";
import {
  materialWithLearningProgress,
  newerRecord,
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
});
