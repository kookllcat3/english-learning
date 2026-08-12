import {
  STORES,
  deleteMaterialBundle,
  readAll,
  readAllByIndex,
  readMany,
  readOne,
  replaceMaterialBundle,
  writeMaterialLearningProgress,
  writeMaterialContent,
  writeMaterialBundles,
  writeOne,
} from "../database/database.js";
import { materialAnnotationsForReplacement } from "../learning/material-annotation.js";
import { normalizedReadingParagraphKey } from "../learning/reading-position.js";
import { sourceWordsForBlocks } from "../learning/reading-content.js";
import {
  currentVocabularyRecord,
  ensureMaterialKnowledge,
  normalizedBlocks,
  requiredMaterialTitle,
  validateMaterialContent,
} from "../learning/material-migrations.js";
import { normalizeWord } from "../text/text.js";
import { materialReplacementState } from "./material-replacement.js";
import { updateMaterialParagraphTranslation } from "./material-translation.js";
import {
  materialLearningProgressState,
  type ReadingParagraphUpdate,
} from "./material-learning-progress.js";
import type {
  BackupMaterial,
  CreateMaterialInput,
  MaterialAssetRecord,
  MaterialRecord,
  StoredMaterialAssetRecord,
  VocabularyRecord,
} from "../models/models.js";
import type { ImportedMaterialFile } from "./material-file-import.js";

export async function getMaterial(id: string): Promise<BackupMaterial> {
  await ensureMaterialKnowledge();
  const [metadata, storedContent] = await Promise.all([
    readOne(STORES.materials, id),
    readOne(STORES.materialContents, id),
  ]);
  if (!metadata || !storedContent) throw new Error("找不到這份教材。");
  const contentBlocks = normalizedBlocks(storedContent.content, storedContent.contentBlocks);
  return {
    ...metadata,
    readingParagraphKey: normalizedReadingParagraphKey(metadata.readingParagraphKey, contentBlocks),
    content: storedContent.content,
    contentBlocks,
  };
}

export async function getMaterialAsset(assetId: string) {
  const asset = await readOne(STORES.materialAssets, assetId);
  return asset ? materialAssetFromStoredRecord(asset) : undefined;
}

export async function getMaterialAssets(materialId: string): Promise<MaterialAssetRecord[]> {
  const assets = await readAllByIndex(STORES.materialAssets, "materialId", materialId);
  return assets.map(materialAssetFromStoredRecord);
}

export function materialAssetFromStoredRecord(asset: StoredMaterialAssetRecord): MaterialAssetRecord {
  const blob = asset.blob instanceof Blob
    ? asset.blob
    : new Blob([new Uint8Array(asset.blob)], { type: asset.mimeType });
  return { ...asset, blob };
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
  if (!material) throw new Error("找不到這份教材。");
  const title = changes.title.trim();
  if (!title) throw new Error("教材名稱不能留空。");
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

export async function updateMaterialTranslation(
  id: string,
  expectedUpdatedAt: string,
  paragraphKey: string,
  text: string,
): Promise<MaterialRecord> {
  await ensureMaterialKnowledge();
  const [material, storedContent] = await Promise.all([
    readOne(STORES.materials, id),
    readOne(STORES.materialContents, id),
  ]);
  if (!material || !storedContent) throw new Error("找不到指定的教材。");
  if (material.updatedAt !== expectedUpdatedAt) {
    throw new Error("教材已在其他分頁更新，請重新載入後再編輯。");
  }
  const update = updateMaterialParagraphTranslation(
    normalizedBlocks(storedContent.content, storedContent.contentBlocks),
    paragraphKey,
    text,
  );
  validateMaterialContent(update.content);
  const updated = { ...material, updatedAt: new Date().toISOString() };
  await writeMaterialContent(
    updated,
    { materialId: id, content: update.content, contentBlocks: update.contentBlocks },
    expectedUpdatedAt,
  );
  return updated;
}

export async function replaceMaterial(
  id: string,
  expectedUpdatedAt: string,
  replacement: ImportedMaterialFile,
): Promise<MaterialRecord> {
  await ensureMaterialKnowledge();
  validateMaterialContent(replacement.content);
  const [currentMaterial, allMaterials, vocabulary, annotations] = await Promise.all([
    readOne(STORES.materials, id),
    readAll(STORES.materials),
    readAll(STORES.vocabulary),
    readAllByIndex(STORES.materialAnnotations, "materialId", id),
  ]);
  if (!currentMaterial) throw new Error("找不到這份教材。");
  if (currentMaterial.updatedAt !== expectedUpdatedAt) {
    throw new Error("這份教材已在其他分頁更新，請重新整理後再試。");
  }

  const contentBlocks = normalizedBlocks(replacement.content, replacement.contentBlocks);
  const words = sourceWordsForBlocks(contentBlocks);
  const updatedAt = new Date().toISOString();
  const state = materialReplacementState(
    currentMaterial,
    words,
    allMaterials.filter((material) => material.id !== id),
    vocabulary,
    updatedAt,
  );
  await replaceMaterialBundle({
    annotations: materialAnnotationsForReplacement(annotations, contentBlocks, updatedAt),
    bundle: {
      metadata: state.material,
      content: replacement.content,
      contentBlocks,
      assets: replacement.assets.map((asset) => ({ ...asset, materialId: id })),
      words,
    },
    expectedUpdatedAt,
    vocabulary: state.vocabulary,
  });
  return state.material;
}

export async function addKnownWordsAndUpdateReadingPosition(
  id: string,
  words: string[],
  readingParagraphUpdate: ReadingParagraphUpdate,
): Promise<MaterialRecord> {
  await ensureMaterialKnowledge();
  const [material, terms, storedContent] = await Promise.all([
    readOne(STORES.materials, id),
    readOne(STORES.materialTerms, id),
    readOne(STORES.materialContents, id),
  ]);
  if (!material || !terms || !storedContent) throw new Error("找不到指定的教材。");
  if (readingParagraphUpdate.mode === "set") {
    const contentBlocks = normalizedBlocks(storedContent.content, storedContent.contentBlocks);
    if (
      normalizedReadingParagraphKey(readingParagraphUpdate.paragraphKey, contentBlocks)
      !== readingParagraphUpdate.paragraphKey
    ) {
      throw new Error("指定的閱讀段落不存在。");
    }
  }

  const normalizedWords = [...new Set(words.map(normalizeWord).filter(Boolean))];
  const currentVocabulary = await readMany(STORES.vocabulary, normalizedWords);
  const state = materialLearningProgressState(
    material,
    terms.words,
    normalizedWords,
    currentVocabulary,
    readingParagraphUpdate,
    new Date().toISOString(),
  );
  await writeMaterialLearningProgress(state.material, state.vocabulary, material.updatedAt);
  return state.material;
}

export async function removeMaterial(id: string): Promise<void> {
  await ensureMaterialKnowledge();
  await deleteMaterialBundle(id, (material, remainingMaterials, vocabulary, timestamp) => {
    const vocabularyByWord = new Map(vocabulary.map((record) => [record.word, record]));
    return material.knownWords.map((word) => {
      const record = vocabularyByWord.get(word) ?? { word, learned: false };
      const learned = remainingMaterials.some((item) => item.knownWords?.includes(word));
      return {
        ...currentVocabularyRecord(record),
        word,
        learned,
        learnedAt: learned ? record.learnedAt ?? timestamp : null,
        updatedAt: timestamp,
      };
    });
  });
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
