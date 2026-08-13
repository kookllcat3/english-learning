import { STORES, readAll } from "../database/database.js";
import { materialAnnotationsForReplacement } from "../learning/material-annotation.js";
import { normalizedReadingParagraphKey } from "../learning/reading-position.js";
import {
  currentVocabularyRecord,
  ensureMaterialKnowledge,
  normalizedBlocks,
  READING_CONTENT_CLASSIFICATION_KEY,
} from "../learning/material-migrations.js";
import { materialAssetFromStoredRecord } from "../materials/material-repository.js";
import type {
  BackupMaterial,
  LearningBackup,
  MaterialAnnotationRecord,
} from "../models/models.js";
import { BACKUP_SCHEMA_VERSION } from "./learning-backup-contract.js";

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

function annotationsByMaterial(
  annotations: MaterialAnnotationRecord[],
): Map<string, MaterialAnnotationRecord[]> {
  const grouped = new Map<string, MaterialAnnotationRecord[]>();
  annotations.forEach((annotation) => {
    const records = grouped.get(annotation.materialId) ?? [];
    records.push(annotation);
    grouped.set(annotation.materialId, records);
  });
  return grouped;
}

export async function createBackup(): Promise<LearningBackup> {
  const [materials, storedAssets, vocabulary, materialAnnotations, wordNotes, settings] = await Promise.all([
    materialsWithContent(),
    readAll(STORES.materialAssets),
    readAll(STORES.vocabulary),
    readAll(STORES.materialAnnotations),
    readAll(STORES.wordNotes),
    readAll(STORES.settings),
  ]);
  const assets = storedAssets.map(materialAssetFromStoredRecord);
  const exportedAt = new Date().toISOString();
  const groupedAnnotations = annotationsByMaterial(materialAnnotations);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    materials,
    materialAssets: await Promise.all(assets.map(async ({ blob, ...asset }) => ({
      ...asset,
      data: await blobToDataUrl(blob),
    }))),
    vocabulary: vocabulary.map(currentVocabularyRecord),
    materialAnnotations: materials.flatMap((material) => materialAnnotationsForReplacement(
      groupedAnnotations.get(material.id) ?? [],
      material.contentBlocks,
      exportedAt,
    )),
    wordNotes,
    settings: settings.filter(({ key }) => ![
      "familiarityTrackingVersion",
      READING_CONTENT_CLASSIFICATION_KEY,
    ].includes(key)),
  };
}
