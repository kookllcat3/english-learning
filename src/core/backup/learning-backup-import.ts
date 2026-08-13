import { STORES, readAll, writeBackupStores } from "../database/database.js";
import { synchronizeVocabularyRecords } from "../learning/learning-records.js";
import { materialAnnotationsForReplacement } from "../learning/material-annotation.js";
import { normalizedReadingParagraphKey } from "../learning/reading-position.js";
import { sourceWordsForBlocks } from "../learning/reading-content.js";
import {
  currentVocabularyRecord,
  metadataFor,
  normalizedBlocks,
  READING_CONTENT_CLASSIFICATION_KEY,
  validateMaterialContent,
} from "../learning/material-migrations.js";
import type { LearningBackup } from "../models/models.js";
import type {
  BackupImportPlan,
  BackupImportPreview,
  BackupImportResult,
} from "./learning-backup-contract.js";
import { prepareBackupImport } from "./learning-backup-import-plan.js";
import { isRecord } from "./learning-backup-shared.js";

function isBackupImportPlan(value: LearningBackup | BackupImportPlan): value is BackupImportPlan {
  return isRecord(value) && "decodedAssets" in value && "backup" in value;
}

export async function previewBackup(backup: LearningBackup): Promise<BackupImportPreview> {
  const plan = prepareBackupImport(backup);
  backup = plan.backup;
  const [currentMaterials, currentVocabulary, currentAnnotations] = await Promise.all([
    readAll(STORES.materials),
    readAll(STORES.vocabulary),
    readAll(STORES.materialAnnotations),
  ]);
  return {
    annotationCount: (backup.materialAnnotations ?? []).length,
    materialCount: backup.materials.length,
    vocabularyCount: backup.vocabulary.length,
    replacedAnnotationCount: currentAnnotations.length,
    replacedMaterialCount: currentMaterials.length,
    replacedVocabularyCount: currentVocabulary.length,
    skippedAnnotations: plan.skippedAnnotations,
    skippedMaterials: plan.skippedMaterials,
    skippedLegacyWordNotes: plan.skippedLegacyWordNotes,
    plan,
  };
}

export async function importBackup(
  input: LearningBackup | BackupImportPlan,
): Promise<BackupImportResult> {
  const plan = isBackupImportPlan(input) ? input : prepareBackupImport(input);
  const backup = plan.backup;
  let vocabulary = backup.vocabulary.map(currentVocabularyRecord);
  const legacyKnownWords = new Set(
    vocabulary.filter((record) => record.learned).map((record) => record.word),
  );
  const bundles = backup.materials.map((material) => {
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
  const referencedAssetMaterialById = new Map<string, string>();
  bundles.forEach((bundle) => {
    bundle.contentBlocks
      .filter((block) => block.type === "image")
      .forEach((block) => {
        const existingMaterialId = referencedAssetMaterialById.get(block.assetId);
        if (existingMaterialId && existingMaterialId !== bundle.metadata.id) {
          throw new Error("備份內有多份教材使用相同的圖片識別碼。");
        }
        referencedAssetMaterialById.set(block.assetId, bundle.metadata.id);
      });
  });
  const importedAssets = plan.decodedAssets.filter((asset) => {
    const materialId = referencedAssetMaterialById.get(asset.id);
    if (!materialId) return false;
    if (asset.materialId !== materialId) {
      throw new Error("備份圖片與教材的關聯不一致。");
    }
    return true;
  });
  if (importedAssets.length !== referencedAssetMaterialById.size) {
    throw new Error("備份缺少教材引用的圖片。");
  }
  const learnedWords = new Set(bundles.flatMap((bundle) => bundle.metadata.knownWords));
  const timestamp = new Date().toISOString();
  vocabulary = synchronizeVocabularyRecords(vocabulary, learnedWords, timestamp);
  const importedAnnotations = backup.materialAnnotations ?? [];
  const materialAnnotations = bundles.flatMap((bundle) => materialAnnotationsForReplacement(
    importedAnnotations.filter((annotation) => annotation.materialId === bundle.metadata.id),
    bundle.contentBlocks,
    timestamp,
  ));
  await writeBackupStores({
    materials: bundles.map((bundle) => bundle.metadata),
    materialAssets: importedAssets,
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
    materialAnnotations,
    wordNotes: backup.wordNotes ?? [],
    settings: (backup.settings ?? []).filter(({ key }) => ![
      "familiarityTrackingVersion",
      READING_CONTENT_CLASSIFICATION_KEY,
    ].includes(key)),
  });
  return {
    skippedAnnotations: plan.skippedAnnotations,
    skippedMaterials: plan.skippedMaterials,
    skippedLegacyWordNotes: plan.skippedLegacyWordNotes,
  };
}
