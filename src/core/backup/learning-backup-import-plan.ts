import {
  contextualWordNoteToMaterialAnnotation,
  materialAnnotationsForReplacement,
} from "../learning/material-annotation.js";
import { normalizedBlocks } from "../learning/material-migrations.js";
import type {
  BackupMaterial,
  LearningBackup,
  MaterialAnnotationRecord,
} from "../models/models.js";
import {
  BACKUP_SCHEMA_VERSION,
  type BackupImportPlan,
} from "./learning-backup-contract.js";
import {
  dataUrlToWebpBlob,
  isRecord,
} from "./learning-backup-shared.js";
import {
  validateBackup,
  validateMaterialAnnotationStructure,
} from "./learning-backup-validation.js";

function materialDisplayName(material: unknown): string {
  return isRecord(material) && typeof material.title === "string" && material.title.trim()
    ? material.title.trim()
    : "未命名教材";
}

function backupWithoutMaterials(backup: LearningBackup): LearningBackup {
  return {
    ...backup,
    materials: [],
    materialAssets: [],
    contextualWordNotes: backup.schemaVersion === 4 ? [] : undefined,
    materialAnnotations: backup.schemaVersion === BACKUP_SCHEMA_VERSION ? [] : undefined,
  };
}

function contextualNotesFor(
  material: unknown,
  notes: LearningBackup["contextualWordNotes"],
): LearningBackup["contextualWordNotes"] {
  if (!isRecord(material) || typeof material.id !== "string") return [];
  return (notes ?? []).filter((note) => isRecord(note) && note.materialId === material.id);
}

function materialAnnotationsFor(
  material: unknown,
  annotations: LearningBackup["materialAnnotations"],
): LearningBackup["materialAnnotations"] {
  if (!isRecord(material) || typeof material.id !== "string") return [];
  return (annotations ?? []).filter((annotation) => (
    isRecord(annotation) && annotation.materialId === material.id
  ));
}

function materialAssetsFor(
  material: unknown,
  assets: LearningBackup["materialAssets"],
): LearningBackup["materialAssets"] {
  if (!isRecord(material) || typeof material.id !== "string") return [];
  return (assets ?? []).filter((asset) => isRecord(asset) && asset.materialId === material.id);
}

function materialId(material: unknown): string | undefined {
  return isRecord(material) && typeof material.id === "string" ? material.id : undefined;
}

function findConflictingMaterialIds(materials: LearningBackup["materials"]): Set<string> {
  const owners = new Map<string, string>();
  const conflicts = new Set<string>();
  materials.forEach((material) => {
    const id = materialId(material);
    if (!id || !Array.isArray(material.contentBlocks)) return;
    material.contentBlocks.forEach((block) => {
      if (!isRecord(block) || block.type !== "image" || typeof block.assetId !== "string") return;
      const owner = owners.get(block.assetId);
      if (owner && owner !== id) {
        conflicts.add(owner);
        conflicts.add(id);
      } else {
        owners.set(block.assetId, id);
      }
    });
  });
  return conflicts;
}

function reconciledAnnotationsForMaterial(
  material: BackupMaterial,
  annotations: MaterialAnnotationRecord[],
  timestamp: string,
): { annotations: MaterialAnnotationRecord[]; skippedCount: number } {
  const blocks = normalizedBlocks(material.content, material.contentBlocks);
  const reconciled = annotations.map((annotation) => materialAnnotationsForReplacement(
    [annotation],
    blocks,
    timestamp,
  ));
  return {
    annotations: reconciled.flat(),
    skippedCount: reconciled.filter((records) => records.length === 0).length,
  };
}

function validateCandidateMaterial(
  candidate: LearningBackup,
  decodedAssetCache: Map<string, Blob>,
): void {
  validateBackup({
    ...candidate,
    ...(candidate.schemaVersion === 4 ? { contextualWordNotes: [] } : {}),
    ...(candidate.schemaVersion === BACKUP_SCHEMA_VERSION ? { materialAnnotations: [] } : {}),
  }, decodedAssetCache);
}

function supportedMaterialIds(materials: LearningBackup["materials"]): Set<string> {
  return new Set(
    materials
      .filter((material): material is LearningBackup["materials"][number] & { id: string } => (
        isRecord(material) && typeof material.id === "string"
      ))
      .map((material) => material.id),
  );
}

export function prepareBackupImport(backup: LearningBackup): BackupImportPlan {
  if (!Array.isArray(backup?.materials) || !Array.isArray(backup?.vocabulary)) {
    validateBackup(backup);
  }
  if (backup.materialAssets !== undefined && !Array.isArray(backup.materialAssets)) {
    validateBackup(backup);
  }

  const decodedAssetCache = new Map<string, Blob>();
  validateMaterialAnnotationStructure(backup.materialAnnotations ?? []);
  const baseBackup = backupWithoutMaterials(backup);
  validateBackup(baseBackup, decodedAssetCache);
  const materialIds = new Map<string, number>();
  backup.materials.forEach((material) => {
    const id = materialId(material);
    if (id) materialIds.set(id, (materialIds.get(id) ?? 0) + 1);
  });
  (backup.materialAssets ?? []).forEach((asset) => {
    if (!isRecord(asset) || typeof asset.materialId !== "string" || !materialIds.has(asset.materialId)) {
      throw new Error("備份圖片缺少有效的教材關聯。");
    }
  });

  const supportedMaterials: LearningBackup["materials"] = [];
  const supportedAnnotations: MaterialAnnotationRecord[] = [];
  let skippedAnnotations = 0;
  const skippedMaterials: string[] = [];
  backup.materials.forEach((material) => {
    const id = materialId(material);
    const candidate: LearningBackup = {
      ...baseBackup,
      materials: [material],
      materialAssets: materialAssetsFor(material, backup.materialAssets),
      ...(backup.schemaVersion === 4
        ? { contextualWordNotes: contextualNotesFor(material, backup.contextualWordNotes) }
        : {}),
      ...(backup.schemaVersion === BACKUP_SCHEMA_VERSION
        ? { materialAnnotations: materialAnnotationsFor(material, backup.materialAnnotations) }
        : {}),
    };
    try {
      if (!id || (materialIds.get(id) ?? 0) > 1) throw new Error("duplicate material id");
      validateCandidateMaterial(candidate, decodedAssetCache);
    } catch {
      skippedMaterials.push(materialDisplayName(material));
      return;
    }
    if (backup.schemaVersion === BACKUP_SCHEMA_VERSION) {
      const reconciled = reconciledAnnotationsForMaterial(
        material,
        candidate.materialAnnotations ?? [],
        backup.exportedAt ?? material.updatedAt,
      );
      skippedAnnotations += reconciled.skippedCount;
      validateBackup({ ...candidate, materialAnnotations: reconciled.annotations }, decodedAssetCache);
      supportedAnnotations.push(...reconciled.annotations);
    } else {
      validateBackup(candidate, decodedAssetCache);
    }
    supportedMaterials.push(material);
  });

  const conflictingMaterialIds = findConflictingMaterialIds(supportedMaterials);
  const retainedMaterials = supportedMaterials.filter((material) => {
    const id = materialId(material);
    if (!id || !conflictingMaterialIds.has(id)) return true;
    skippedMaterials.push(materialDisplayName(material));
    return false;
  });
  const retainedMaterialIds = supportedMaterialIds(retainedMaterials);
  const filteredBackup: LearningBackup = {
    ...backup,
    materials: retainedMaterials,
    materialAssets: (backup.materialAssets ?? [])
      .filter((asset) => retainedMaterialIds.has(asset.materialId)),
    ...(backup.schemaVersion === 4
      ? {
        contextualWordNotes: (backup.contextualWordNotes ?? [])
          .filter((note) => retainedMaterialIds.has(note.materialId)),
      }
      : {}),
    ...(backup.schemaVersion === BACKUP_SCHEMA_VERSION
      ? {
        materialAnnotations: supportedAnnotations
          .filter((annotation) => retainedMaterialIds.has(annotation.materialId)),
      }
      : {}),
  };
  validateBackup(filteredBackup, decodedAssetCache);
  const materialAnnotations: MaterialAnnotationRecord[] = [
    ...(filteredBackup.materialAnnotations ?? []),
    ...(filteredBackup.contextualWordNotes ?? []).map(contextualWordNoteToMaterialAnnotation),
  ];
  const decodedAssets = (filteredBackup.materialAssets ?? []).map(({ data, ...asset }) => ({
    ...asset,
    blob: decodedAssetCache.get(asset.id) ?? dataUrlToWebpBlob(data),
  }));
  return {
    backup: {
      ...filteredBackup,
      contextualWordNotes: undefined,
      materialAnnotations,
    },
    skippedAnnotations,
    skippedMaterials,
    skippedLegacyWordNotes: 0,
    decodedAssets,
  };
}
