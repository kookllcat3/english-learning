import {
  contextualWordNoteId,
  isContextualOccurrenceValid,
  isValidWordNoteContext,
} from "../learning/contextual-word-note.js";
import { readingWordOccurrencesForBlocks } from "../learning/reading-content.js";
import {
  hasValidReadingParagraphReference,
  normalizedBlocks,
  validateMaterialContent,
} from "../learning/material-migrations.js";
import type {
  LearningBackup,
  MaterialAnnotationRecord,
} from "../models/models.js";
import {
  AI_PROMPT_MAX_LENGTH,
  MATERIAL_GUIDE_PROMPT_MAX_LENGTH,
  MATERIAL_GUIDE_PROMPT_SETTING_KEYS,
} from "../settings/settings-repository.js";
import { isValidWord } from "../text/text.js";
import {
  BACKUP_SCHEMA_VERSION,
  SUPPORTED_BACKUP_SCHEMA_VERSIONS,
} from "./learning-backup-contract.js";
import {
  dataUrlToWebpBlob,
  isRecord,
  isTimestamp,
  MAX_BACKUP_ASSET_BYTES,
  UUID_PATTERN,
} from "./learning-backup-shared.js";

interface MaterialValidationContext {
  materialIds: Set<string>;
  materialBlocksById: Map<string, ReturnType<typeof normalizedBlocks>>;
  referencedAssetIds: Set<string>;
  assetMaterialById: Map<string, string>;
}

function validateBackupShape(backup: LearningBackup): void {
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
}

function validateMaterials(backup: LearningBackup): MaterialValidationContext {
  const context: MaterialValidationContext = {
    materialIds: new Set<string>(),
    materialBlocksById: new Map<string, ReturnType<typeof normalizedBlocks>>(),
    referencedAssetIds: new Set<string>(),
    assetMaterialById: new Map<string, string>(),
  };
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
            if (context.referencedAssetIds.has(block.assetId)) return false;
            context.referencedAssetIds.add(block.assetId);
            context.assetMaterialById.set(block.assetId, material.id);
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
    if (!isValid || context.materialIds.has(material.id)) {
      throw new Error("備份包含格式不正確或重複的教材資料。");
    }
    validateMaterialContent(material.content);
    context.materialIds.add(material.id);
    context.materialBlocksById.set(
      material.id,
      normalizedBlocks(material.content, material.contentBlocks),
    );
  });
  return context;
}

function validateAssets(
  backup: LearningBackup,
  context: MaterialValidationContext,
  decodedAssetCache: Map<string, Blob>,
): void {
  if (backup.materialAssets !== undefined && !Array.isArray(backup.materialAssets)) {
    throw new Error("備份的圖片資料格式不正確。");
  }
  const assetIds = new Set<string>();
  (backup.materialAssets ?? []).forEach((asset) => {
    const isValid = isRecord(asset)
      && typeof asset.id === "string"
      && typeof asset.materialId === "string"
      && context.materialIds.has(asset.materialId)
      && context.assetMaterialById.get(asset.id) === asset.materialId
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
    const blob = decodedAssetCache.get(asset.id) ?? dataUrlToWebpBlob(asset.data);
    decodedAssetCache.set(asset.id, blob);
    if (blob.size > MAX_BACKUP_ASSET_BYTES) throw new Error("備份圖片超過 2 MB。");
    assetIds.add(asset.id);
  });
  if ([...context.referencedAssetIds].some((id) => !assetIds.has(id))) {
    throw new Error("備份缺少教材引用的圖片。");
  }
  if ([...assetIds].some((id) => !context.referencedAssetIds.has(id))) {
    throw new Error("備份包含未被教材引用的圖片。");
  }
}

function validateVocabulary(backup: LearningBackup): void {
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
}

function validateWordNotes(backup: LearningBackup): void {
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
}

function validateContextualWordNotes(
  backup: LearningBackup,
  context: MaterialValidationContext,
): void {
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
      && context.materialIds.has(note.materialId)
      && isContextualOccurrenceValid(
        note,
        context.materialBlocksById.get(note.materialId) ?? [],
      )
      && typeof note.markdown === "string"
      && note.markdown.length <= 20_000
      && isTimestamp(note.createdAt)
      && isTimestamp(note.updatedAt);
    if (!isValid || contextualNoteIds.has(note.id)) {
      throw new Error("備份包含格式不正確、重複或沒有教材關聯的位置型單字筆記。");
    }
    contextualNoteIds.add(note.id);
  });
}

function validateLegacyContextualAnnotation(
  annotation: Record<string, unknown>,
  context: MaterialValidationContext,
): void {
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
    id: annotation.id as string,
    materialId: annotation.materialId as string,
    occurrenceKey: annotation.target.occurrenceKey,
    word: annotation.target.word,
    markdown: annotation.body.value,
    createdAt: annotation.createdAt as string,
    updatedAt: annotation.updatedAt as string,
  };
  const isValid = note.markdown.length <= 20_000
    && isValidWordNoteContext(note)
    && note.id === contextualWordNoteId(note)
    && isContextualOccurrenceValid(
      note,
      context.materialBlocksById.get(note.materialId) ?? [],
    );
  if (!isValid) {
    throw new Error("備份包含格式不正確或沒有教材關聯的舊版位置型單字筆記。");
  }
}

function validateHighlightAnnotation(
  annotation: Record<string, unknown>,
  context: MaterialValidationContext,
  highlightedOccurrences: Set<string>,
): void {
  if (
    !UUID_PATTERN.test(annotation.id as string)
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
  const materialId = annotation.materialId as string;
  const blocks = context.materialBlocksById.get(materialId) ?? [];
  const paragraphOccurrences = readingWordOccurrencesForBlocks(blocks)
    .filter((occurrence) => occurrence.paragraphKey === paragraphKey)
    .map((occurrence) => occurrence.wordKey);
  const occurrenceSet = new Set(occurrenceKeys);
  const orderedKeys = paragraphOccurrences.filter((key) => occurrenceSet.has(key));
  const isValid = occurrenceSet.size === occurrenceKeys.length
    && orderedKeys.length === occurrenceKeys.length
    && orderedKeys.every((key, index) => key === occurrenceKeys[index]);
  if (!isValid) throw new Error("備份包含無效或沒有教材關聯的螢光標記。");
  occurrenceKeys.forEach((occurrenceKey) => {
    const identity = `${materialId}\u0000${occurrenceKey}`;
    if (highlightedOccurrences.has(identity)) {
      throw new Error("備份包含重疊的螢光標記。");
    }
    highlightedOccurrences.add(identity);
  });
}

export function validateMaterialAnnotationStructure(annotations: unknown[]): void {
  const annotationIds = new Set<string>();
  annotations.forEach((annotation) => {
    if (
      !isRecord(annotation)
      || typeof annotation.id !== "string"
      || annotation.id.length === 0
      || annotation.id.length > 500
      || typeof annotation.materialId !== "string"
      || annotation.materialId.length === 0
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
      };
      if (
        note.markdown.length > 20_000
        || !isValidWordNoteContext(note)
        || note.id !== contextualWordNoteId(note)
      ) {
        throw new Error("備份包含格式不正確的舊版位置型單字筆記。");
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
        || new Set(annotation.target.occurrenceKeys).size !== annotation.target.occurrenceKeys.length
        || annotation.style.color !== "yellow"
      ) {
        throw new Error("備份包含格式不正確的螢光標記。");
      }
    } else {
      throw new Error("備份包含不受支援的教材標記種類。");
    }
    annotationIds.add(annotation.id);
  });
}

function validateMaterialAnnotations(
  backup: LearningBackup,
  context: MaterialValidationContext,
): void {
  const annotationIds = new Set<string>();
  const highlightedOccurrences = new Set<string>();
  validateMaterialAnnotationStructure(backup.materialAnnotations ?? []);
  (backup.materialAnnotations ?? []).forEach((annotation: MaterialAnnotationRecord) => {
    if (
      !isRecord(annotation)
      || typeof annotation.id !== "string"
      || annotation.id.length === 0
      || annotation.id.length > 500
      || typeof annotation.materialId !== "string"
      || !context.materialIds.has(annotation.materialId)
      || !isTimestamp(annotation.createdAt)
      || !isTimestamp(annotation.updatedAt)
      || annotationIds.has(annotation.id)
    ) {
      throw new Error("備份包含格式不正確或重複的教材標記。");
    }
    if (annotation.kind === "legacy-contextual-word-note") {
      validateLegacyContextualAnnotation(annotation, context);
    } else if (annotation.kind === "highlight") {
      validateHighlightAnnotation(annotation, context, highlightedOccurrences);
    } else {
      throw new Error("備份包含不受支援的教材標記種類。");
    }
    annotationIds.add(annotation.id);
  });
}

function validateSettings(backup: LearningBackup): void {
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

export function validateBackup(
  backup: LearningBackup,
  decodedAssetCache = new Map<string, Blob>(),
): void {
  validateBackupShape(backup);
  const materialContext = validateMaterials(backup);
  validateAssets(backup, materialContext, decodedAssetCache);
  validateVocabulary(backup);
  validateWordNotes(backup);
  validateContextualWordNotes(backup, materialContext);
  validateMaterialAnnotations(backup, materialContext);
  validateSettings(backup);
}
