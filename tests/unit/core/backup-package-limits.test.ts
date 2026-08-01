import { describe, expect, it } from "vitest";
import {
  ArchiveReadBudget,
  assertArchiveResourceLimits,
  assertPackageArchiveSize,
  MAX_PACKAGE_ENTRIES,
  MAX_PACKAGE_ARCHIVE_BYTES,
  MAX_PACKAGE_EXPANDED_BYTES,
  MAX_PACKAGE_FILE_BYTES,
} from "../../../src/core/backup/backup-package-limits.js";

function file(path: string, uncompressedSize: number) {
  return { compressedSize: 1, directory: false, path, uncompressedSize };
}

describe("backup package resource limits", () => {
  it("accepts a package within every resource limit", () => {
    expect(() => assertArchiveResourceLimits([
      file("manifest.json", 128),
      file("data/materials.json", 1024),
    ])).not.toThrow();
  });

  it("rejects too many archive entries", () => {
    const entries = Array.from({ length: MAX_PACKAGE_ENTRIES + 1 }, (_, index) => file(`${index}.json`, 1));
    expect(() => assertArchiveResourceLimits(entries)).toThrow("過多檔案");
  });

  it("counts directory entries toward the archive entry limit", () => {
    const entries = Array.from({ length: MAX_PACKAGE_ENTRIES + 1 }, (_, index) => ({
      compressedSize: 0,
      directory: true,
      path: `${index}/`,
      uncompressedSize: 0,
    }));
    expect(() => assertArchiveResourceLimits(entries)).toThrow("過多檔案");
  });

  it("rejects an oversized individual file", () => {
    expect(() => assertArchiveResourceLimits([
      file("data/materials.json", MAX_PACKAGE_FILE_BYTES + 1),
    ])).toThrow("超出安全範圍");
  });

  it("rejects excessive cumulative expanded data", () => {
    const entries = Array.from(
      { length: Math.ceil(MAX_PACKAGE_EXPANDED_BYTES / MAX_PACKAGE_FILE_BYTES) + 1 },
      (_, index) => file(`${index}.json`, MAX_PACKAGE_FILE_BYTES),
    );
    expect(() => assertArchiveResourceLimits(entries)).toThrow("總容量");
  });

  it("rejects an oversized package before loading the ZIP directory", () => {
    expect(() => assertPackageArchiveSize(MAX_PACKAGE_ARCHIVE_BYTES + 1)).toThrow("封裝檔案大小");
  });

  it("enforces actual streamed output even when archive metadata is forged", () => {
    const budget = new ArchiveReadBudget();
    expect(() => budget.consume("data/materials.json", MAX_PACKAGE_FILE_BYTES, 1))
      .toThrow("檔案大小");
  });
});
