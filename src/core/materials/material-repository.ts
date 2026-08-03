import {
  STORES,
  deleteMaterialBundle,
  readAll,
  readMany,
  readOne,
  writeLearningProgress,
  writeMaterialBundles,
  writeOne,
} from "../database/database.js";
import { materialWithLearningProgress } from "../learning/learning-records.js";
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
import type {
  BackupMaterial,
  CreateMaterialInput,
  MaterialAssetRecord,
  MaterialRecord,
  StoredMaterialAssetRecord,
  VocabularyRecord,
} from "../models/models.js";

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

export async function setMaterialReadingParagraph(
  id: string,
  readingParagraphKey: string | null,
): Promise<MaterialRecord> {
  await ensureMaterialKnowledge();
  const [material, storedContent] = await Promise.all([
    readOne(STORES.materials, id),
    readOne(STORES.materialContents, id),
  ]);
  if (!material || !storedContent) throw new Error("找不到指定的教材。");
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
  if (!material || !terms) throw new Error("找不到這份教材。");
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
