import { describe, expect, it } from "vitest";
import { createBackupPackage } from "../../../src/core/backup/backup-package.js";
import { loadJsZip } from "../../../src/core/services/jszip-loader.js";
import type { LearningBackup } from "../../../src/core/models/models.js";

const AI_GUIDE_FILE = "AI_README.md";
const timestamp = "2026-08-27T00:00:00.000Z";

function backupFixture(): LearningBackup {
  return {
    schemaVersion: 6,
    exportedAt: timestamp,
    materials: [{
      id: "00000000-0000-4000-8000-000000000001",
      title: "Synthetic material",
      description: "",
      createdAt: timestamp,
      updatedAt: timestamp,
      wordCount: 1,
      knownCount: 1,
      knownWords: ["animal"],
      content: "Animal",
      contentBlocks: [{ type: "text", text: "Animal", order: 0 }],
    }],
    materialAssets: [],
    vocabulary: [{
      word: "animal",
      learned: true,
      learnedAt: timestamp,
      updatedAt: timestamp,
    }],
    materialAnnotations: [],
    wordNotes: [],
    settings: [],
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("backup package AI guide", () => {
  it("exports a declared and checksummed guide with accurate learning semantics", async () => {
    const packageBlob = await createBackupPackage(backupFixture());
    const archive = await (await loadJsZip()).loadAsync(await packageBlob.arrayBuffer());
    const manifest = JSON.parse(await archive.file("manifest.json")!.async("text")) as {
      aiGuide?: string;
      files: Array<{ path: string; size: number; type: string }>;
    };
    const checksums = JSON.parse(await archive.file("checksums.json")!.async("text")) as {
      files: Record<string, string>;
    };
    const guideBytes = await archive.file(AI_GUIDE_FILE)!.async("uint8array");
    const guide = new TextDecoder().decode(guideBytes);

    expect(manifest.aiGuide).toBe(AI_GUIDE_FILE);
    expect(manifest.files).toContainEqual({
      path: AI_GUIDE_FILE,
      size: guideBytes.byteLength,
      type: "documentation",
    });
    expect(checksums.files[AI_GUIDE_FILE]).toBe(await sha256(guideBytes));
    expect(guide).toContain("`knownCount` is coverage count, not a comprehension score");
    expect(guide).toContain("Re-reading the same material many times still counts as one material");
    expect(guide).toContain("It is not a CEFR word level or language proficiency level");
  });

});
