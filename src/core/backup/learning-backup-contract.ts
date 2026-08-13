import type {
  LearningBackup,
  MaterialAssetRecord,
} from "../models/models.js";

export const BACKUP_SCHEMA_VERSION = 6;
export const SUPPORTED_BACKUP_SCHEMA_VERSIONS = [1, 2, 3, 4, 5, BACKUP_SCHEMA_VERSION];

export interface BackupImportPlan {
  backup: LearningBackup;
  skippedAnnotations: number;
  skippedMaterials: string[];
  skippedLegacyWordNotes: number;
  decodedAssets: MaterialAssetRecord[];
}

export interface BackupImportPreview {
  annotationCount: number;
  materialCount: number;
  vocabularyCount: number;
  replacedAnnotationCount: number;
  replacedMaterialCount: number;
  replacedVocabularyCount: number;
  skippedAnnotations: number;
  skippedMaterials: string[];
  skippedLegacyWordNotes: number;
  plan: BackupImportPlan;
}

export interface BackupImportResult {
  skippedAnnotations: number;
  skippedMaterials: string[];
  skippedLegacyWordNotes: number;
}
