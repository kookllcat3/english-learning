import { STORES, readAll, writeBackupStores } from "../database/database.js";
import { mergeNewerRecords, synchronizeVocabularyRecords } from "../learning/learning-records.js";
import {
  contextualWordNoteId,
  isContextualOccurrenceValid,
  isValidWordNoteContext,
} from "../learning/contextual-word-note.js";
import {
  contextualWordNoteToMaterialAnnotation,
  mergeImportedMaterialAnnotations,
  materialAnnotationsForReplacement,
} from "../learning/material-annotation.js";
import { normalizedReadingParagraphKey } from "../learning/reading-position.js";
import {
  readingWordOccurrencesForBlocks,
  sourceWordsForBlocks,
} from "../learning/reading-content.js";
import {
  currentVocabularyRecord,
  ensureMaterialKnowledge,
  hasValidReadingParagraphReference,
  listMaterials,
  metadataFor,
  normalizedBlocks,
  READING_CONTENT_CLASSIFICATION_KEY,
  validateMaterialContent,
} from "../learning/material-migrations.js";
import { materialAssetFromStoredRecord } from "../materials/material-repository.js";
import { isValidWord } from "../text/text.js";
import {
  AI_PROMPT_MAX_LENGTH,
  MATERIAL_GUIDE_PROMPT_MAX_LENGTH,
  MATERIAL_GUIDE_PROMPT_SETTING_KEYS,
} from "../settings/settings-repository.js";
import type {
  BackupMaterial,
  LearningBackup,
  MaterialAnnotationRecord,
  MaterialAssetRecord,
} from "../models/models.js";

const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const BACKUP_SCHEMA_VERSION = 6;
const SUPPORTED_BACKUP_SCHEMA_VERSIONS = [1, 2, 3, 4, 5, BACKUP_SCHEMA_VERSION];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
  const [materials, storedAssets, vocabulary, materialAnnotations, wordNotes, settings] = await Promise.all([
    materialsWithContent(),
    readAll(STORES.materialAssets),
    readAll(STORES.vocabulary),
    readAll(STORES.materialAnnotations),
    readAll(STORES.wordNotes),
    readAll(STORES.settings),
  ]);
  const assets = storedAssets.map(materialAssetFromStoredRecord);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    materials,
    materialAssets: await Promise.all(assets.map(async ({ blob, ...asset }) => ({
      ...asset,
      data: await blobToDataUrl(blob),
    }))),
    vocabulary: vocabulary.map(currentVocabularyRecord),
    materialAnnotations,
    wordNotes,
    settings: settings.filter(({ key }) => ![
      "familiarityTrackingVersion",
      READING_CONTENT_CLASSIFICATION_KEY,
    ].includes(key)),
  };
}

export interface BackupImportPreview {
  newAnnotations: number;
  newMaterials: number;
  updatedMaterials: number;
  updatedAnnotations: number;
  newWords: number;
  updatedWords: number;
  skippedMaterials: string[];
  skippedLegacyWordNotes: number;
  plan: BackupImportPlan;
}

export interface BackupImportResult {
  skippedMaterials: string[];
  skippedLegacyWordNotes: number;
}

export interface BackupImportPlan {
  backup: LearningBackup;
  skippedMaterials: string[];
  skippedLegacyWordNotes: number;
  decodedAssets: MaterialAssetRecord[];
}

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

function prepareBackup(backup: LearningBackup): BackupImportPlan {
  if (!Array.isArray(backup?.materials) || !Array.isArray(backup?.vocabulary)) {
    validateBackup(backup);
  }
  if (backup.materialAssets !== undefined && !Array.isArray(backup.materialAssets)) {
    validateBackup(backup);
  }

  const decodedAssetCache = new Map<string, Blob>();
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
      validateBackup({
        ...candidate,
        ...(backup.schemaVersion === 4 ? { contextualWordNotes: [] } : {}),
        ...(backup.schemaVersion === BACKUP_SCHEMA_VERSION ? { materialAnnotations: [] } : {}),
      }, decodedAssetCache);
    } catch {
      skippedMaterials.push(materialDisplayName(material));
      return;
    }
    validateBackup(candidate, decodedAssetCache);
    supportedMaterials.push(material);
  });
  const conflictingMaterialIds = findConflictingMaterialIds(supportedMaterials);
  const retainedMaterials = supportedMaterials.filter((material) => {
    const id = materialId(material);
    if (!id || !conflictingMaterialIds.has(id)) return true;
    skippedMaterials.push(materialDisplayName(material));
    return false;
  });
  const supportedMaterialIds = new Set(
    retainedMaterials
      .filter((material): material is LearningBackup["materials"][number] & { id: string } => (
        isRecord(material) && typeof material.id === "string"
      ))
      .map((material) => material.id),
  );
  const filteredBackup: LearningBackup = {
    ...backup,
    materials: retainedMaterials,
    materialAssets: (backup.materialAssets ?? []).filter((asset) => supportedMaterialIds.has(asset.materialId)),
    ...(backup.schemaVersion === 4
      ? {
        contextualWordNotes: (backup.contextualWordNotes ?? [])
          .filter((note) => supportedMaterialIds.has(note.materialId)),
      }
      : {}),
    ...(backup.schemaVersion === BACKUP_SCHEMA_VERSION
      ? {
        materialAnnotations: (backup.materialAnnotations ?? [])
          .filter((annotation) => supportedMaterialIds.has(annotation.materialId)),
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
    blob: decodedAssetCache.get(asset.id) ?? dataUrlToBlob(data),
  }));
  return {
    backup: {
      ...filteredBackup,
      contextualWordNotes: undefined,
      materialAnnotations,
    },
    skippedMaterials,
    skippedLegacyWordNotes: 0,
    decodedAssets,
  };
}

function validateBackup(backup: LearningBackup, decodedAssetCache = new Map<string, Blob>()): void {
  if (!backup || !SUPPORTED_BACKUP_SCHEMA_VERSIONS.includes(backup.schemaVersion)) {
    throw new Error("這份備份的版本不受支援。");
  }
  if (!Array.isArray(backup.materials) || !Array.isArray(backup.vocabulary)) {
    throw new Error("備份缺少教材或詞彙資料。");
  }
  if (backup.settings !== undefined && !Array.isArray(backup.settings)) {
    throw new Error("備份的設定資料格式不正確。");
  }
  if (backup.wordNotes !== undefined && !Array.isArray(backup.wordNotes)) {
    throw new Error("備份的單字筆記格式不正確。");
  }
  if (backup.contextualWordNotes !== undefined && !Array.isArray(backup.contextualWordNotes)) {
    throw new Error("備份的位置型單字筆記格式不正確。");
  }
  if (backup.materialAnnotations !== undefined && !Array.isArray(backup.materialAnnotations)) {
    throw new Error("備份的教材標記格式不正確。");
  }
  if (backup.schemaVersion === 4 && !Array.isArray(backup.contextualWordNotes)) {
    throw new Error("備份缺少位置型單字筆記資料。");
  }
  if (backup.schemaVersion >= 5 && !Array.isArray(backup.wordNotes)) {
    throw new Error("備份缺少單字筆記資料。");
  }
  if (backup.schemaVersion === BACKUP_SCHEMA_VERSION && !Array.isArray(backup.materialAnnotations)) {
    throw new Error("備份缺少教材標記資料。");
  }
  if (backup.schemaVersion !== BACKUP_SCHEMA_VERSION && backup.materialAnnotations !== undefined) {
    throw new Error("舊版備份不得包含新版教材標記資料。");
  }
  if (backup.schemaVersion !== 4 && backup.contextualWordNotes !== undefined) {
    throw new Error("備份版本與位置型單字筆記格式不相容。");
  }

  const isTimestamp = (value: unknown): value is string =>
    typeof value === "string" && Number.isFinite(Date.parse(value));
  const materialIds = new Set<string>();
  const materialBlocksById = new Map<string, ReturnType<typeof normalizedBlocks>>();
  const referencedAssetIds = new Set<string>();
  const assetMaterialById = new Map<string, string>();
  backup.materials.forEach((material) => {
    const isValid = isRecord(material)
      && typeof material.id === "string"
      && UUID_PATTERN.test(material.id)
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
      throw new Error("備份包含格式不正確或重複的教材資料。");
    }
    validateMaterialContent(material.content);
    materialIds.add(material.id);
    materialBlocksById.set(material.id, normalizedBlocks(material.content, material.contentBlocks));
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
    const blob = decodedAssetCache.get(asset.id) ?? dataUrlToBlob(asset.data);
    decodedAssetCache.set(asset.id, blob);
    if (blob.size > MAX_ASSET_BYTES) throw new Error("備份圖片超過 2 MB。");
    assetIds.add(asset.id);
  });
  if ([...referencedAssetIds].some((id) => !assetIds.has(id))) {
    throw new Error("備份缺少教材引用的圖片。");
  }
  if ([...assetIds].some((id) => !referencedAssetIds.has(id))) {
    throw new Error("備份包含未被教材引用的圖片。");
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

  const contextualNoteIds = new Set<string>();
  (backup.contextualWordNotes ?? []).forEach((note) => {
    const isValid = isRecord(note)
      && typeof note.id === "string"
      && typeof note.materialId === "string"
      && typeof note.occurrenceKey === "string"
      && typeof note.word === "string"
      && isValidWordNoteContext({
        materialId: note.materialId,
        occurrenceKey: note.occurrenceKey,
        word: note.word,
      })
      && note.id === contextualWordNoteId(note)
      && materialIds.has(note.materialId)
      && isContextualOccurrenceValid(note, materialBlocksById.get(note.materialId) ?? [])
      && typeof note.markdown === "string"
      && note.markdown.length <= 20_000
      && isTimestamp(note.createdAt)
      && isTimestamp(note.updatedAt);
    if (!isValid || contextualNoteIds.has(note.id)) {
      throw new Error("備份包含格式不正確、重複或沒有教材關聯的位置型單字筆記。");
    }
    contextualNoteIds.add(note.id);
  });

  const annotationIds = new Set<string>();
  const highlightedOccurrences = new Set<string>();
  (backup.materialAnnotations ?? []).forEach((annotation: unknown) => {
    if (
      !isRecord(annotation)
      || typeof annotation.id !== "string"
      || annotation.id.length === 0
      || annotation.id.length > 500
      || typeof annotation.materialId !== "string"
      || !materialIds.has(annotation.materialId)
      || !isTimestamp(annotation.createdAt)
      || !isTimestamp(annotation.updatedAt)
      || annotationIds.has(annotation.id)
    ) {
      throw new Error("備份包含格式不正確或重複的教材標記。");
    }

    if (annotation.kind === "legacy-contextual-word-note") {
      if (
        !isRecord(annotation.target)
        || !isRecord(annotation.body)
        || annotation.target.type !== "contextual-word-occurrence"
        || annotation.body.format !== "markdown"
        || typeof annotation.target.occurrenceKey !== "string"
        || typeof annotation.target.word !== "string"
        || typeof annotation.body.value !== "string"
      ) {
        throw new Error("備份包含格式不正確的舊版位置型單字筆記。");
      }
      const note = {
        id: annotation.id,
        materialId: annotation.materialId,
        occurrenceKey: annotation.target.occurrenceKey,
        word: annotation.target.word,
        markdown: annotation.body.value,
        createdAt: annotation.createdAt,
        updatedAt: annotation.updatedAt,
      };
      const isValidLegacyNote = note.markdown.length <= 20_000
        && isValidWordNoteContext(note)
        && note.id === contextualWordNoteId(note)
        && isContextualOccurrenceValid(
          note,
          materialBlocksById.get(note.materialId) ?? [],
        );
      if (!isValidLegacyNote) {
        throw new Error("備份包含格式不正確或沒有教材關聯的舊版位置型單字筆記。");
      }
    } else if (annotation.kind === "highlight") {
      if (
        !UUID_PATTERN.test(annotation.id)
        || !isRecord(annotation.target)
        || !isRecord(annotation.style)
        || annotation.target.type !== "reading-word-occurrences"
        || typeof annotation.target.paragraphKey !== "string"
        || annotation.target.paragraphKey.length === 0
        || !Array.isArray(annotation.target.occurrenceKeys)
        || annotation.target.occurrenceKeys.length === 0
        || !annotation.target.occurrenceKeys.every((key) => typeof key === "string")
        || annotation.style.color !== "yellow"
      ) {
        throw new Error("備份包含格式不正確的螢光標記。");
      }
      const occurrenceKeys = annotation.target.occurrenceKeys as string[];
      const paragraphKey = annotation.target.paragraphKey;
      const blocks = materialBlocksById.get(annotation.materialId) ?? [];
      const paragraphOccurrences = readingWordOccurrencesForBlocks(blocks)
        .filter((occurrence) => occurrence.paragraphKey === paragraphKey)
        .map((occurrence) => occurrence.wordKey);
      const occurrenceSet = Array.isArray(occurrenceKeys)
        ? new Set(occurrenceKeys)
        : new Set<unknown>();
      const orderedKeys = paragraphOccurrences.filter((key) => occurrenceSet.has(key));
      const isValidHighlight = occurrenceSet.size === occurrenceKeys.length
        && orderedKeys.length === occurrenceKeys.length
        && orderedKeys.every((key, index) => key === occurrenceKeys[index]);
      if (!isValidHighlight) throw new Error("備份包含無效或沒有教材關聯的螢光標記。");
      occurrenceKeys.forEach((occurrenceKey) => {
        const identity = `${annotation.materialId}\u0000${occurrenceKey}`;
        if (highlightedOccurrences.has(identity)) {
          throw new Error("備份包含重疊的螢光標記。");
        }
        highlightedOccurrences.add(identity);
      });
    } else {
      throw new Error("備份包含不受支援的教材標記種類。");
    }
    annotationIds.add(annotation.id);
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
    const isMaterialGuidePrompt = isRecord(setting)
      && typeof setting.key === "string"
      && MATERIAL_GUIDE_PROMPT_SETTING_KEYS.includes(setting.key)
      && typeof setting.value === "string"
      && setting.value.trim().length > 0
      && setting.value.length <= MATERIAL_GUIDE_PROMPT_MAX_LENGTH
      && isTimestamp(setting.updatedAt);
    // Accepted only so backups made during the former view-count experiment remain importable.
    const isLegacyFamiliarityTrackingVersion = isRecord(setting)
      && setting.key === "familiarityTrackingVersion"
      && Number.isInteger(setting.value)
      && isTimestamp(setting.updatedAt);
    if (
      !isSearchHistory
      && !isFamiliarityColor
      && !isAiPrompt
      && !isMaterialGuidePrompt
      && !isLegacyFamiliarityTrackingVersion
    ) {
      throw new Error("備份包含不受支援的設定資料。");
    }
  });
}

function isBackupImportPlan(value: LearningBackup | BackupImportPlan): value is BackupImportPlan {
  return isRecord(value) && "decodedAssets" in value && "backup" in value;
}

export async function previewBackup(backup: LearningBackup): Promise<BackupImportPreview> {
  const plan = prepareBackup(backup);
  backup = plan.backup;
  const [currentMaterials, currentVocabulary, currentAnnotations] = await Promise.all([
    listMaterials(),
    readAll(STORES.vocabulary),
    readAll(STORES.materialAnnotations),
  ]);
  const materialIds = new Set(currentMaterials.map((item) => item.id));
  const words = new Set(currentVocabulary.map((item) => item.word));
  const annotationIds = new Set(currentAnnotations.map((item) => item.id));
  return {
    newAnnotations: (backup.materialAnnotations ?? [])
      .filter((item) => !annotationIds.has(item.id)).length,
    newMaterials: backup.materials.filter((item) => !materialIds.has(item.id)).length,
    updatedMaterials: backup.materials.filter((item) => materialIds.has(item.id)).length,
    updatedAnnotations: (backup.materialAnnotations ?? [])
      .filter((item) => annotationIds.has(item.id)).length,
    newWords: backup.vocabulary.filter((item) => !words.has(item.word)).length,
    updatedWords: backup.vocabulary.filter((item) => words.has(item.word)).length,
    skippedMaterials: plan.skippedMaterials,
    skippedLegacyWordNotes: plan.skippedLegacyWordNotes,
    plan,
      };
}

export async function importBackup(
  input: LearningBackup | BackupImportPlan,
): Promise<BackupImportResult> {
  const plan = isBackupImportPlan(input) ? input : prepareBackup(input);
  const backup = plan.backup;
  const [currentMaterials, currentAssets, currentVocabulary, currentAnnotations, currentWordNotes, currentSettings] = await Promise.all([
    materialsWithContent(),
    readAll(STORES.materialAssets).then((assets) => assets.map(materialAssetFromStoredRecord)),
    readAll(STORES.vocabulary),
    readAll(STORES.materialAnnotations),
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
  plan.decodedAssets.forEach((asset) => {
    assetRecords.set(asset.id, asset);
  });
  const referencedAssetMaterialById = new Map<string, string>();
  bundles.forEach((bundle) => {
    bundle.contentBlocks
      .filter((block) => block.type === "image")
      .forEach((block) => {
        const existingMaterialId = referencedAssetMaterialById.get(block.assetId);
        if (existingMaterialId && existingMaterialId !== bundle.metadata.id) {
          throw new Error("備份與現有教材使用了相同的圖片識別碼。");
        }
        referencedAssetMaterialById.set(block.assetId, bundle.metadata.id);
      });
  });
  const mergedAssets = [...assetRecords.values()].filter((asset) => {
    const materialId = referencedAssetMaterialById.get(asset.id);
    if (!materialId) return false;
    if (asset.materialId !== materialId) {
      throw new Error("備份與教材的圖片關聯不一致。");
    }
    return true;
  });
  if (mergedAssets.length !== referencedAssetMaterialById.size) {
    throw new Error("備份或現有教材缺少引用的圖片。");
  }
  const learnedWords = new Set(bundles.flatMap((bundle) => bundle.metadata.knownWords));
  const timestamp = new Date().toISOString();
  vocabulary = synchronizeVocabularyRecords(vocabulary, learnedWords, timestamp);
  const materialsWithAuthoritativeHighlights = backup.schemaVersion === BACKUP_SCHEMA_VERSION
    ? new Set(backup.materials.map((material) => material.id))
    : new Set<string>();
  const mergedAnnotations = mergeImportedMaterialAnnotations(
    currentAnnotations,
    backup.materialAnnotations ?? [],
    materialsWithAuthoritativeHighlights,
  );
  const materialAnnotations = bundles.flatMap((bundle) => materialAnnotationsForReplacement(
    mergedAnnotations.filter((annotation) => annotation.materialId === bundle.metadata.id),
    bundle.contentBlocks,
    timestamp,
  ));
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
    materialAnnotations,
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
  return {
    skippedMaterials: plan.skippedMaterials,
    skippedLegacyWordNotes: plan.skippedLegacyWordNotes,
  };
}
