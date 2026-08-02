import {
  STORES,
  deleteMaterialBundle,
  readAll,
  readMany,
  readOne,
  writeBackupStores,
  writeLearningProgress,
  writeMaterialKnowledgeMigration,
  writeMaterialBundles,
  writeOne,
} from "../database/database.js";
import {
  materialWithLearningProgress,
  mergeNewerRecords,
  synchronizeVocabularyRecords,
} from "./learning-records.js";
import {
  hasReadingParagraphKey,
  normalizedReadingParagraphKey,
} from "./reading-position.js";
import { sourceWordsForBlocks } from "./reading-content.js";
import {
  fileNameWithoutExtension,
  isValidWord,
  normalizeWord,
  utf8Size,
} from "../text/text.js";
import { AI_PROMPT_MAX_LENGTH } from "../settings/settings-repository.js";
import type {
  BackupMaterial,
  ContentBlock,
  CreateMaterialInput,
  LearningBackup,
  MaterialRecord,
  VocabularyRecord,
} from "../models/models.js";

const MAX_MATERIAL_BYTES = 2 * 1024 * 1024;
const BACKUP_SCHEMA_VERSION = 3;
const MATERIALS_PER_PAGE = 12;
const READING_CONTENT_CLASSIFICATION_KEY = "readingContentClassificationVersion";
const READING_CONTENT_CLASSIFICATION_VERSION = 1;

export type MaterialSort = "newest" | "oldest" | "progress" | "title";

let materialIndexPromise: Promise<void> | undefined;
let materialKnowledgePromise: Promise<void> | undefined;

function requiredMaterialTitle(title: string, fileName: string): string {
  const resolvedTitle = title.trim() || fileNameWithoutExtension(fileName);
  if (!resolvedTitle) throw new Error("素材需要檔名或名稱。");
  return resolvedTitle.slice(0, 80);
}

function validateMaterialContent(content: string): void {
  if (!content.trim()) throw new Error("素材內容不能是空白。");
  if (utf8Size(content) > MAX_MATERIAL_BYTES) {
    throw new Error("單份素材請控制在 2 MB 以內。");
  }
}

function currentVocabularyRecord(record: VocabularyRecord): VocabularyRecord {
  const {
    exposureCount: _legacyExposureCount,
    lastSeenAt: _legacyLastSeenAt,
    ...current
  } = record;
  return current;
}

function metadataFor(
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

function normalizedBlocks(content: string, contentBlocks?: ContentBlock[]): ContentBlock[] {
  return Array.isArray(contentBlocks) && contentBlocks.length > 0
    ? contentBlocks.map((block, order) => ({ ...block, order }))
    : textBlocks(content);
}

function hasValidReadingParagraphReference(material: Record<string, unknown>): boolean {
  const value = material.readingParagraphKey;
  if (value === undefined || value === null) return true;
  if (typeof material.content !== "string") return false;
  const contentBlocks = material.contentBlocks;
  if (contentBlocks !== undefined && !Array.isArray(contentBlocks)) return false;
  const blocks = normalizedBlocks(material.content, contentBlocks as ContentBlock[] | undefined);
  return typeof value === "string" && hasReadingParagraphKey(value, blocks);
}

async function readKnownWords(): Promise<Set<string>> {
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

async function ensureMaterialKnowledge(): Promise<void> {
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

async function listMaterials(): Promise<MaterialRecord[]> {
  await ensureMaterialKnowledge();
  return readAll(STORES.materials);
}

export async function getMaterial(id: string): Promise<BackupMaterial> {
  await ensureMaterialKnowledge();
  const [metadata, storedContent] = await Promise.all([
    readOne(STORES.materials, id),
    readOne(STORES.materialContents, id),
  ]);
  if (!metadata || !storedContent) throw new Error("找不到這份素材。");
  const contentBlocks = normalizedBlocks(storedContent.content, storedContent.contentBlocks);
  return {
    ...metadata,
    readingParagraphKey: normalizedReadingParagraphKey(metadata.readingParagraphKey, contentBlocks),
    content: storedContent.content,
    contentBlocks,
  };
}

export async function getMaterialAsset(assetId: string) {
  return readOne(STORES.materialAssets, assetId);
}

export async function createMaterial({
  title,
  description,
  content,
  contentBlocks,
  assets = [],
  fileName,
}: CreateMaterialInput): Promise<MaterialRecord> {
  await ensureMaterialKnowledge();
  validateMaterialContent(content);
  const timestamp = new Date().toISOString();
  const normalizedContentBlocks = normalizedBlocks(content, contentBlocks);
  const words = sourceWordsForBlocks(normalizedContentBlocks);
  const material = {
    id: crypto.randomUUID(),
    title: requiredMaterialTitle(title, fileName),
    description: description.trim().slice(0, 160),
    createdAt: timestamp,
    updatedAt: timestamp,
    wordCount: words.length,
    knownCount: 0,
    knownWords: [],
  };
  await writeMaterialBundles([{
    metadata: material,
    content,
    contentBlocks: normalizedContentBlocks,
    assets: assets.map((asset) => ({ ...asset, materialId: material.id })),
    words,
  }]);
  return material;
}

export async function updateMaterial(
  id: string,
  changes: { title: string; description?: string },
): Promise<MaterialRecord> {
  await ensureMaterialKnowledge();
  const material = await readOne(STORES.materials, id);
  if (!material) throw new Error("找不到這份素材。");
  const title = changes.title.trim();
  if (!title) throw new Error("素材名稱不能留空。");
  const updated = {
    ...material,
    title: title.slice(0, 80),
    description: changes.description === undefined
      ? material.description
      : changes.description.trim().slice(0, 160),
    updatedAt: new Date().toISOString(),
  };
  return writeOne(STORES.materials, updated);
}

export async function setMaterialReadingParagraph(
  id: string,
  readingParagraphKey: string | null,
): Promise<MaterialRecord> {
  await ensureMaterialKnowledge();
  const [material, storedContent] = await Promise.all([
    readOne(STORES.materials, id),
    readOne(STORES.materialContents, id),
  ]);
  if (!material || !storedContent) throw new Error("找不到指定的素材。");
  const contentBlocks = normalizedBlocks(storedContent.content, storedContent.contentBlocks);
  if (
    readingParagraphKey !== null
    && normalizedReadingParagraphKey(readingParagraphKey, contentBlocks) !== readingParagraphKey
  ) {
    throw new Error("指定的閱讀段落不存在。");
  }
  return writeOne(STORES.materials, {
    ...material,
    readingParagraphKey,
    updatedAt: new Date().toISOString(),
  });
}

export async function removeMaterial(id: string): Promise<void> {
  await ensureMaterialKnowledge();
  const material = await readOne(STORES.materials, id);
  await deleteMaterialBundle(id);
  if (!material?.knownWords?.length) return;
  const [remainingMaterials, currentRecords] = await Promise.all([
    readAll(STORES.materials),
    readMany(STORES.vocabulary, material.knownWords),
  ]);
  const timestamp = new Date().toISOString();
  const vocabulary = material.knownWords.map((word, index) => {
    const record = currentRecords[index] ?? { word, learned: false };
    const learned = remainingMaterials.some((item) => item.knownWords?.includes(word));
    return {
      ...currentVocabularyRecord(record),
      word,
      learned,
      learnedAt: learned ? record.learnedAt ?? timestamp : null,
      updatedAt: timestamp,
    };
  });
  await writeLearningProgress([], vocabulary);
}

export async function getVocabularyProgress(
  materialId: string,
): Promise<Map<string, VocabularyRecord>> {
  await ensureMaterialKnowledge();
  const [terms, materials] = await Promise.all([
    readOne(STORES.materialTerms, materialId),
    readAll(STORES.materials),
  ]);
  const materialWords = terms?.words ?? [];
  const records = await readMany(STORES.vocabulary, materialWords);
  const currentKnownWords = new Set(
    materials.find((material) => material.id === materialId)?.knownWords ?? [],
  );
  const materialCountByWord = new Map<string, number>();
  materials.forEach(({ knownWords = [] }) => {
    new Set(knownWords).forEach((word) => {
      materialCountByWord.set(word, (materialCountByWord.get(word) ?? 0) + 1);
    });
  });
  return new Map(materialWords.map((word, index) => [
    word,
    {
      ...currentVocabularyRecord(records[index] ?? { word, learned: false }),
      learned: currentKnownWords.has(word),
      materialCount: materialCountByWord.get(word) ?? 0,
    },
  ]));
}

export async function setWordsKnown(
  materialId: string,
  words: string[],
  learned: boolean,
): Promise<void> {
  await ensureMaterialKnowledge();
  const [material, terms, allMaterials] = await Promise.all([
    readOne(STORES.materials, materialId),
    readOne(STORES.materialTerms, materialId),
    readAll(STORES.materials),
  ]);
  if (!material || !terms) throw new Error("找不到這份素材。");
  const materialWordSet = new Set(terms.words);
  const normalizedWords = [...new Set(words.map(normalizeWord).filter((word) =>
    word && materialWordSet.has(word)))];
  const currentRecords = await readMany(STORES.vocabulary, normalizedWords);
  const knownWords = new Set(material.knownWords);
  normalizedWords.forEach((word) => {
    if (learned) knownWords.add(word);
    else knownWords.delete(word);
  });
  const orderedKnownWords = terms.words.filter((word) => knownWords.has(word));
  const otherMaterials = allMaterials.filter((item) => item.id !== materialId);
  const timestamp = new Date().toISOString();
  const updatedMaterial = materialWithLearningProgress(material, orderedKnownWords, timestamp);
  const vocabulary = normalizedWords.map((word, index) => {
    const record = currentRecords[index] ?? { word, learned: false };
    const learnedAnywhere = knownWords.has(word)
      || otherMaterials.some((item) => item.knownWords.includes(word));
    return {
      ...currentVocabularyRecord(record),
      word,
      learned: learnedAnywhere,
      learnedAt: learnedAnywhere ? record.learnedAt ?? timestamp : null,
      updatedAt: timestamp,
    };
  });
  await writeLearningProgress([updatedMaterial], vocabulary);
}

function materialCompletion(material: MaterialRecord): number {
  return material.wordCount === 0 ? 0 : material.knownCount / material.wordCount;
}

function compareMaterials(
  sort: MaterialSort,
): (first: MaterialRecord, second: MaterialRecord) => number {
  if (sort === "oldest") {
    return (first, second) => first.createdAt.localeCompare(second.createdAt);
  }
  if (sort === "title") {
    return (first, second) => first.title.localeCompare(second.title, "zh-Hant");
  }
  if (sort === "progress") {
    return (first, second) => materialCompletion(second) - materialCompletion(first)
      || second.updatedAt.localeCompare(first.updatedAt);
  }
  return (first, second) => second.createdAt.localeCompare(first.createdAt);
}

export async function getDashboard(
  page = 1,
  query = "",
  sort: MaterialSort = "newest",
) {
  const [materials, knownWords] = await Promise.all([listMaterials(), readKnownWords()]);
  const materialCount = materials.length;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredMaterials = normalizedQuery
    ? materials.filter((material) =>
      `${material.title}\n${material.description}`.toLocaleLowerCase().includes(normalizedQuery))
    : materials;
  filteredMaterials.sort(compareMaterials(sort));
  const filteredCount = filteredMaterials.length;
  const pageCount = Math.max(1, Math.ceil(filteredCount / MATERIALS_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const start = (currentPage - 1) * MATERIALS_PER_PAGE;
  const totalProgress = materials.reduce(
    (sum, material) => sum + materialCompletion(material),
    0,
  );
  const statistics = {
    materialCount,
    knownWordCount: knownWords.size,
    averageCompletion: materialCount === 0 ? 0 : totalProgress / materialCount,
  };
  return {
    materials: filteredMaterials.slice(start, start + MATERIALS_PER_PAGE).map((material) => ({
      ...material,
      completion: materialCompletion(material),
    })),
    statistics,
    pagination: {
      currentPage,
      pageCount,
      totalItems: filteredCount,
      totalLibraryItems: materialCount,
      startItem: filteredCount === 0 ? 0 : start + 1,
      endItem: Math.min(start + MATERIALS_PER_PAGE, filteredCount),
      query: query.trim(),
      sort,
    },
  };
}

async function materialsWithContent(): Promise<BackupMaterial[]> {
  await ensureMaterialKnowledge();
  const [materials, contents] = await Promise.all([
    readAll(STORES.materials),
    readAll(STORES.materialContents),
  ]);
  const contentById = new Map(contents.map((item) => [item.materialId, item]));
  return materials.map((material) => {
    const stored = contentById.get(material.id);
    const content = stored?.content ?? "";
    const contentBlocks = normalizedBlocks(content, stored?.contentBlocks);
    return {
      ...material,
      readingParagraphKey: normalizedReadingParagraphKey(material.readingParagraphKey, contentBlocks),
      content,
      contentBlocks,
    };
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("無法將圖片轉換為備份格式。"));
    }, { once: true });
    reader.addEventListener("error", () => reject(reader.error), { once: true });
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:(image\/webp);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw new Error("備份包含格式不正確的 WebP 圖片。");
  const binary = atob(match[2].replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (
    bytes.length < 12
    || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF"
    || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"
  ) {
    throw new Error("備份包含損壞的 WebP 圖片。");
  }
  return new Blob([bytes], { type: match[1].toLocaleLowerCase() });
}

export async function createBackup(): Promise<LearningBackup> {
  const [materials, assets, vocabulary, wordNotes, settings] = await Promise.all([
    materialsWithContent(),
    readAll(STORES.materialAssets),
    readAll(STORES.vocabulary),
    readAll(STORES.wordNotes),
    readAll(STORES.settings),
  ]);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    materials,
    materialAssets: await Promise.all(assets.map(async ({ blob, ...asset }) => ({
      ...asset,
      data: await blobToDataUrl(blob),
    }))),
    vocabulary: vocabulary.map(currentVocabularyRecord),
    wordNotes,
    settings: settings.filter(({ key }) => ![
      "familiarityTrackingVersion",
      READING_CONTENT_CLASSIFICATION_KEY,
    ].includes(key)),
  };
}

function validateBackup(backup: LearningBackup): void {
  if (!backup || ![1, 2, BACKUP_SCHEMA_VERSION].includes(backup.schemaVersion)) {
    throw new Error("這份備份的版本不受支援。");
  }
  if (!Array.isArray(backup.materials) || !Array.isArray(backup.vocabulary)) {
    throw new Error("備份缺少素材或詞彙資料。");
  }
  if (backup.settings !== undefined && !Array.isArray(backup.settings)) {
    throw new Error("備份的設定資料格式不正確。");
  }
  if (backup.wordNotes !== undefined && !Array.isArray(backup.wordNotes)) {
    throw new Error("備份的單字筆記格式不正確。");
  }

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const isTimestamp = (value: unknown): value is string =>
    typeof value === "string" && Number.isFinite(Date.parse(value));
  const materialIds = new Set<string>();
  const referencedAssetIds = new Set<string>();
  const assetMaterialById = new Map<string, string>();
  backup.materials.forEach((material) => {
    const isValid = isRecord(material)
      && typeof material.id === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(material.id)
      && typeof material.title === "string"
      && material.title.trim().length > 0
      && material.title.length <= 80
      && typeof material.description === "string"
      && material.description.length <= 160
      && typeof material.content === "string"
      && (
        material.contentBlocks === undefined
        || (
          Array.isArray(material.contentBlocks)
          && material.contentBlocks.length > 0
          && material.contentBlocks.every((block, index) => {
            if (!isRecord(block) || block.order !== index) return false;
            if (block.type === "text") return typeof block.text === "string";
            if (block.type !== "image" || typeof block.assetId !== "string") return false;
            if (referencedAssetIds.has(block.assetId)) return false;
            referencedAssetIds.add(block.assetId);
            assetMaterialById.set(block.assetId, material.id);
            return typeof block.alt === "string"
              && block.alt.length <= 200
              && typeof (block.caption ?? "") === "string";
          })
        )
      )
      && (
        material.knownWords === undefined
        || (
          Array.isArray(material.knownWords)
          && new Set(material.knownWords).size === material.knownWords.length
          && material.knownWords.every(isValidWord)
        )
      )
      && hasValidReadingParagraphReference(material)
      && isTimestamp(material.createdAt)
      && isTimestamp(material.updatedAt);
    if (!isValid || materialIds.has(material.id)) {
      throw new Error("備份包含格式不正確或重複的素材資料。");
    }
    validateMaterialContent(material.content);
    materialIds.add(material.id);
  });

  if (backup.materialAssets !== undefined && !Array.isArray(backup.materialAssets)) {
    throw new Error("備份的圖片資料格式不正確。");
  }
  const assetIds = new Set<string>();
  (backup.materialAssets ?? []).forEach((asset) => {
    const isValid = isRecord(asset)
      && typeof asset.id === "string"
      && typeof asset.materialId === "string"
      && materialIds.has(asset.materialId)
      && assetMaterialById.get(asset.id) === asset.materialId
      && asset.mimeType === "image/webp"
      && Number.isInteger(asset.width)
      && asset.width > 0
      && Number.isInteger(asset.height)
      && asset.height > 0
      && typeof asset.alt === "string"
      && asset.alt.length <= 200
      && typeof asset.caption === "string"
      && typeof asset.data === "string";
    if (!isValid || assetIds.has(asset.id)) {
      throw new Error("備份包含格式不正確或重複的圖片資料。");
    }
    const blob = dataUrlToBlob(asset.data);
    if (blob.size > 2 * 1024 * 1024) throw new Error("備份圖片超過 2 MB。");
    assetIds.add(asset.id);
  });
  if ([...referencedAssetIds].some((id) => !assetIds.has(id))) {
    throw new Error("備份缺少素材引用的圖片。");
  }
  if ([...assetIds].some((id) => !referencedAssetIds.has(id))) {
    throw new Error("備份包含未被素材引用的圖片。");
  }

  const vocabularyWords = new Set<string>();
  backup.vocabulary.forEach((record) => {
    const isValid = isRecord(record)
      && typeof record.word === "string"
      && isValidWord(record.word)
      && typeof record.learned === "boolean"
      && (record.learnedAt === null || isTimestamp(record.learnedAt))
      && isTimestamp(record.updatedAt);
    if (!isValid || vocabularyWords.has(record.word)) {
      throw new Error("備份包含格式不正確或重複的詞彙資料。");
    }
    vocabularyWords.add(record.word);
  });

  const noteWords = new Set<string>();
  (backup.wordNotes ?? []).forEach((note) => {
    const isValid = isRecord(note)
      && typeof note.word === "string"
      && isValidWord(note.word)
      && typeof note.markdown === "string"
      && note.markdown.length <= 20_000
      && isTimestamp(note.createdAt)
      && isTimestamp(note.updatedAt);
    if (!isValid || noteWords.has(note.word)) {
      throw new Error("備份包含格式不正確或重複的單字筆記。");
    }
    noteWords.add(note.word);
  });

  (backup.settings ?? []).forEach((setting) => {
    const isSearchHistory = isRecord(setting)
      && setting.key === "searchHistory"
      && Array.isArray(setting.value)
      && setting.value.length <= 8
      && setting.value.every((query) => typeof query === "string" && query.length <= 200)
      && isTimestamp(setting.updatedAt);
    const isFamiliarityColor = isRecord(setting)
      && setting.key === "familiarityColor"
      && typeof setting.value === "string"
      && /^#[0-9a-f]{6}$/i.test(setting.value)
      && isTimestamp(setting.updatedAt);
    const isAiPrompt = isRecord(setting)
      && setting.key === "aiPrompt"
      && typeof setting.value === "string"
      && setting.value.trim().length > 0
      && setting.value.length <= AI_PROMPT_MAX_LENGTH
      && isTimestamp(setting.updatedAt);
    // Accepted only so backups made during the former view-count experiment remain importable.
    const isLegacyFamiliarityTrackingVersion = isRecord(setting)
      && setting.key === "familiarityTrackingVersion"
      && Number.isInteger(setting.value)
      && isTimestamp(setting.updatedAt);
    if (!isSearchHistory && !isFamiliarityColor && !isAiPrompt && !isLegacyFamiliarityTrackingVersion) {
      throw new Error("備份包含不受支援的設定資料。");
    }
  });
}

export async function previewBackup(backup: LearningBackup) {
  validateBackup(backup);
  const [currentMaterials, currentVocabulary] = await Promise.all([
    listMaterials(),
    readAll(STORES.vocabulary),
  ]);
  const materialIds = new Set(currentMaterials.map((item) => item.id));
  const words = new Set(currentVocabulary.map((item) => item.word));
  return {
    newMaterials: backup.materials.filter((item) => !materialIds.has(item.id)).length,
    updatedMaterials: backup.materials.filter((item) => materialIds.has(item.id)).length,
    newWords: backup.vocabulary.filter((item) => !words.has(item.word)).length,
    updatedWords: backup.vocabulary.filter((item) => words.has(item.word)).length,
  };
}

export async function importBackup(backup: LearningBackup): Promise<void> {
  validateBackup(backup);
  const [currentMaterials, currentAssets, currentVocabulary, currentWordNotes, currentSettings] = await Promise.all([
    materialsWithContent(),
    readAll(STORES.materialAssets),
    readAll(STORES.vocabulary),
    readAll(STORES.wordNotes),
    readAll(STORES.settings),
  ]);
  let vocabulary = mergeNewerRecords(currentVocabulary, backup.vocabulary, "word")
    .map(currentVocabularyRecord);
  const legacyKnownWords = new Set(
    vocabulary.filter((record) => record.learned).map((record) => record.word),
  );
  const mergedMaterials = mergeNewerRecords(currentMaterials, backup.materials, "id");
  const bundles = mergedMaterials.map((material) => {
    validateMaterialContent(material.content);
    const contentBlocks = normalizedBlocks(material.content, material.contentBlocks);
    const words = sourceWordsForBlocks(contentBlocks);
    const knownWords = new Set(
      Array.isArray(material.knownWords) ? material.knownWords : legacyKnownWords,
    );
    return {
      metadata: metadataFor({
        ...material,
        readingParagraphKey: normalizedReadingParagraphKey(
          material.readingParagraphKey,
          contentBlocks,
        ),
      }, words, knownWords),
      content: material.content,
      contentBlocks,
      words,
    };
  });
  const assetRecords = new Map(currentAssets.map((asset) => [asset.id, asset]));
  (backup.materialAssets ?? []).forEach(({ data, ...asset }) => {
    assetRecords.set(asset.id, { ...asset, blob: dataUrlToBlob(data) });
  });
  const referencedAssetMaterialById = new Map<string, string>();
  bundles.forEach((bundle) => {
    bundle.contentBlocks
      .filter((block) => block.type === "image")
      .forEach((block) => {
        const existingMaterialId = referencedAssetMaterialById.get(block.assetId);
        if (existingMaterialId && existingMaterialId !== bundle.metadata.id) {
          throw new Error("備份與現有素材使用了相同的圖片識別碼。");
        }
        referencedAssetMaterialById.set(block.assetId, bundle.metadata.id);
      });
  });
  const mergedAssets = [...assetRecords.values()].filter((asset) => {
    const materialId = referencedAssetMaterialById.get(asset.id);
    if (!materialId) return false;
    if (asset.materialId !== materialId) {
      throw new Error("備份與素材的圖片關聯不一致。");
    }
    return true;
  });
  if (mergedAssets.length !== referencedAssetMaterialById.size) {
    throw new Error("備份或現有素材缺少引用的圖片。");
  }
  const learnedWords = new Set(bundles.flatMap((bundle) => bundle.metadata.knownWords));
  const timestamp = new Date().toISOString();
  vocabulary = synchronizeVocabularyRecords(vocabulary, learnedWords, timestamp);
  await writeBackupStores({
    materials: bundles.map((bundle) => bundle.metadata),
    materialAssets: mergedAssets,
    materialContents: bundles.map((bundle) => ({
      materialId: bundle.metadata.id,
      content: bundle.content,
      contentBlocks: bundle.contentBlocks,
    })),
    materialTerms: bundles.map((bundle) => ({
      materialId: bundle.metadata.id,
      words: bundle.words,
    })),
    vocabulary,
    wordNotes: mergeNewerRecords(currentWordNotes, backup.wordNotes ?? [], "word"),
    settings: mergeNewerRecords(
      currentSettings.filter(({ key }) => key !== "familiarityTrackingVersion"),
      (backup.settings ?? []).filter(({ key }) => ![
        "familiarityTrackingVersion",
        READING_CONTENT_CLASSIFICATION_KEY,
      ].includes(key)),
      "key",
    ),
  });
}
