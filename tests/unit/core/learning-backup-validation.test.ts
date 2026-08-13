import { describe, expect, it } from "vitest";

import { validateBackup } from "../../../src/core/backup/learning-backup-validation.js";
import type { LearningBackup } from "../../../src/core/models/models.js";

const timestamp = "2026-08-13T08:00:00.000Z";

function backup(overrides: Partial<LearningBackup> = {}): LearningBackup {
  return {
    schemaVersion: 1,
    materials: [],
    vocabulary: [],
    ...overrides,
  };
}

describe("learning backup validation", () => {
  it("accepts the minimum supported legacy backup", () => {
    expect(() => validateBackup(backup())).not.toThrow();
  });

  it("rejects an unsupported schema version", () => {
    expect(() => validateBackup(backup({ schemaVersion: 0 })))
      .toThrow("這份備份的版本不受支援");
  });

  it("requires material annotations in the current schema", () => {
    expect(() => validateBackup(backup({
      schemaVersion: 6,
      wordNotes: [],
    }))).toThrow("備份缺少教材標記資料");
  });

  it("rejects duplicate vocabulary records", () => {
    const vocabularyRecord = {
      word: "driver",
      learned: false,
      learnedAt: null,
      updatedAt: timestamp,
    };

    expect(() => validateBackup(backup({
      vocabulary: [vocabularyRecord, vocabularyRecord],
    }))).toThrow("重複的詞彙資料");
  });

  it("rejects settings outside the backup allowlist", () => {
    expect(() => validateBackup(backup({
      settings: [{ key: "unknownSetting", value: true, updatedAt: timestamp }],
    }))).toThrow("設定資料");
  });
});
