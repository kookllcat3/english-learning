import {
  STORES,
  readAll,
  readOne,
  writeMaterialKnowledgeMigration,
  writeMaterialBundles,
} from "../database/database.js";
import { synchronizeVocabularyRecords } from "./learning-records.js";
import { hasReadingParagraphKey, normalizedReadingParagraphKey } from "./reading-position.js";
import { sourceWordsForBlocks } from "./reading-content.js";
import { fileNameWithoutExtension, utf8Size } from "../text/text.js";
import type {
  BackupMaterial,
  ContentBlock,
  MaterialRecord,
  VocabularyRecord,
} from "../models/models.js";

const MAX_MATERIAL_BYTES = 2 * 1024 * 1024;
export const READING_CONTENT_CLASSIFICATION_KEY = "readingContentClassificationVersion";
const READING_CONTENT_CLASSIFICATION_VERSION = 1;

let materialIndexPromise: Promise<void> | undefined;
let materialKnowledgePromise: Promise<void> | undefined;

export function requiredMaterialTitle(title: string, fileName: string): string {
  const resolvedTitle = title.trim() || fileNameWithoutExtension(fileName);
  if (!resolvedTitle) throw new Error("教材需要檔名或名稱。");
  return resolvedTitle.slice(0, 80);
}

export function validateMaterialContent(content: string): void {
  if (!content.trim()) throw new Error("教材內容不能是空白。");
  if (utf8Size(content) > MAX_MATERIAL_BYTES) {
    throw new Error("單份教材請控制在 2 MB 以內。");
  }
}

export function currentVocabularyRecord(record: VocabularyRecord): VocabularyRecord {
  const {
    exposureCount: _legacyExposureCount,
    lastSeenAt: _legacyLastSeenAt,
    ...current
  } = record;
  return current;
}

export function metadataFor(
  material: MaterialRecord | BackupMaterial,
  words: string[],
  knownWords: Set<string>,
): MaterialRecord {
  const { content: _content, contentBlocks: _contentBlocks, ...metadata } = material;
  const materialKnownWords = words.filter((word) => knownWords.has(word));
  return {
    ...metadata,
    wordCount: words.length,
    knownCount: materialKnownWords.length,
    knownWords: materialKnownWords,
  };
}

function textBlocks(content: string): ContentBlock[] {
  return [{ type: "text", text: content, order: 0 }];
}

export function normalizedBlocks(content: string, contentBlocks?: ContentBlock[]): ContentBlock[] {
  return Array.isArray(contentBlocks) && contentBlocks.length > 0
    ? contentBlocks.map((block, order) => ({ ...block, order }))
    : textBlocks(content);
}

export function hasValidReadingParagraphReference(material: Record<string, unknown>): boolean {
  const value = material.readingParagraphKey;
  if (value === undefined || value === null) return true;
  if (typeof material.content !== "string") return false;
  const contentBlocks = material.contentBlocks;
  if (contentBlocks !== undefined && !Array.isArray(contentBlocks)) return false;
  const blocks = normalizedBlocks(material.content, contentBlocks as ContentBlock[] | undefined);
  return typeof value === "string" && hasReadingParagraphKey(value, blocks);
}

export async function readKnownWords(): Promise<Set<string>> {
  const records = await readAll(STORES.vocabulary);
  return new Set(records.filter((record) => record.learned).map((record) => record.word));
}

async function ensureMaterialIndex(): Promise<void> {
  if (!materialIndexPromise) {
    materialIndexPromise = (async () => {
      const materials = await readAll(STORES.materials);
      const legacyMaterials = materials.filter(
        (material): material is MaterialRecord & { content: string } =>
          typeof material.content === "string",
      );
      if (legacyMaterials.length === 0) return;
      const knownWords = await readKnownWords();
      const bundles = legacyMaterials.map((material) => {
        const contentBlocks = textBlocks(material.content);
        const words = sourceWordsForBlocks(contentBlocks);
        return {
          metadata: metadataFor(material, words, knownWords),
          content: material.content,
          contentBlocks,
          words,
        };
      });
      await writeMaterialBundles(bundles);
    })().catch((error) => {
      materialIndexPromise = undefined;
      throw error;
    });
  }
  return materialIndexPromise;
}

export async function ensureMaterialKnowledge(): Promise<void> {
  await ensureMaterialIndex();
  if (!materialKnowledgePromise) {
    materialKnowledgePromise = (async () => {
      const classificationSetting = await readOne(
        STORES.settings,
        READING_CONTENT_CLASSIFICATION_KEY,
      );
      if (classificationSetting?.value === READING_CONTENT_CLASSIFICATION_VERSION) return;
      const [materials, contents, vocabulary] = await Promise.all([
        readAll(STORES.materials),
        readAll(STORES.materialContents),
        readAll(STORES.vocabulary),
      ]);
      const legacyKnownWords = new Set(
        vocabulary.filter((record) => record.learned).map((record) => record.word),
      );
      const contentByMaterial = new Map(contents.map((record) => [record.materialId, record]));
      const blocksByMaterial = new Map<string, ContentBlock[]>();
      const materialTerms = materials.map((material) => {
        const storedContent = contentByMaterial.get(material.id);
        const blocks = normalizedBlocks(
          storedContent?.content ?? "",
          storedContent?.contentBlocks,
        );
        blocksByMaterial.set(material.id, blocks);
        return { materialId: material.id, words: sourceWordsForBlocks(blocks) };
      });
      const wordsByMaterial = new Map(
        materialTerms.map((record) => [record.materialId, record.words]),
      );
      const migratedMaterials = materials.map((material) => metadataFor(
        {
          ...material,
          readingParagraphKey: normalizedReadingParagraphKey(
            material.readingParagraphKey,
            blocksByMaterial.get(material.id) ?? [],
          ),
        },
        wordsByMaterial.get(material.id) ?? [],
        new Set(Array.isArray(material.knownWords) ? material.knownWords : legacyKnownWords),
      ));
      const learnedWords = new Set(migratedMaterials.flatMap((material) => material.knownWords));
      const timestamp = new Date().toISOString();
      await writeMaterialKnowledgeMigration(
        migratedMaterials,
        materialTerms,
        synchronizeVocabularyRecords(vocabulary, learnedWords, timestamp),
        {
          key: READING_CONTENT_CLASSIFICATION_KEY,
          value: READING_CONTENT_CLASSIFICATION_VERSION,
          updatedAt: timestamp,
        },
      );
    })().catch((error) => {
      materialKnowledgePromise = undefined;
      throw error;
    });
  }
  return materialKnowledgePromise;
}

export async function listMaterials(): Promise<MaterialRecord[]> {
  await ensureMaterialKnowledge();
  return readAll(STORES.materials);
}
