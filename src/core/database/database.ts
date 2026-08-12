import type {
  BackupStoreRecords,
  MaterialAssetRecord,
  MaterialAnnotationRecord,
  MaterialBundle,
  MaterialContentRecord,
  MaterialHighlightAnnotationRecord,
  MaterialRecord,
  MaterialTermsRecord,
  SettingRecord,
  StoredMaterialAssetRecord,
  VocabularyRecord,
  WordNoteRecord,
} from "../models/models.js";
import {
  contextualWordNoteToMaterialAnnotation,
  isContextualWordNoteRecord,
} from "../learning/material-annotation.js";

const DATABASE_NAME = "english-learning";
const DATABASE_VERSION = 9;
const BACKUP_TRANSACTION_TIMEOUT_MS = 60_000;
const LEGACY_CONTEXTUAL_WORD_NOTES_STORE = "contextualWordNotes";

export const STORES = Object.freeze({
  materialAssets: "materialAssets",
  materialAnnotations: "materialAnnotations",
  materialContents: "materialContents",
  materialTerms: "materialTerms",
  materials: "materials",
  settings: "settings",
  vocabulary: "vocabulary",
  wordNotes: "wordNotes",
});

type StoreName = typeof STORES[keyof typeof STORES];

interface StoreRecordMap {
  materialAssets: StoredMaterialAssetRecord;
  materialAnnotations: MaterialAnnotationRecord;
  materialContents: MaterialContentRecord;
  materialTerms: MaterialTermsRecord;
  materials: MaterialRecord;
  settings: SettingRecord;
  vocabulary: VocabularyRecord;
  wordNotes: WordNoteRecord;
}

let databasePromise: Promise<IDBDatabase> | undefined;

interface TransactionFailureState {
  error: DOMException | null;
}

async function storedAsset(asset: MaterialAssetRecord): Promise<StoredMaterialAssetRecord> {
  return {
    ...asset,
    blob: await blobToArrayBuffer(asset.blob),
  };
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("圖片二進位轉換失敗。"));
    }, { once: true });
    reader.addEventListener("error", () => reject(reader.error), { once: true });
    reader.readAsArrayBuffer(blob);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionResult(
  transaction: IDBTransaction,
  timeoutMs = 0,
  failureMessage = "資料庫交易失敗，資料未寫入。",
  failureState?: TransactionFailureState,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve();
    };
    const transactionError = (): Error => {
      const cause = failureState?.error ?? transaction.error;
      if (!cause) return new Error(failureMessage);
      const name = typeof cause.name === "string" ? cause.name.trim() : "";
      const message = typeof cause.message === "string" ? cause.message.trim() : "";
      const hint = name === "QuotaExceededError"
        ? "瀏覽器儲存空間不足，請清理此網站的儲存空間後重試。"
        : name === "UnknownError"
          ? "瀏覽器未能完成 IndexedDB 寫入，可能與圖片 Blob 或 Safari 儲存限制有關。"
          : name === "DataError"
            ? "資料庫拒絕了匯入資料格式。"
            : "";
      const detail = [message, name && `(${name})`].filter(Boolean).join(" ");
      return new Error(`${failureMessage} ${hint || detail}`.trim());
    };

    transaction.addEventListener("complete", () => finish(), { once: true });
    transaction.addEventListener("abort", () => finish(transactionError()), { once: true });
    transaction.addEventListener("error", () => finish(transactionError()), { once: true });
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        finish(new Error("資料庫寫入逾時，匯入已取消；原有資料未變更。"));
        try {
          transaction.abort();
        } catch {
          // The transaction may have completed while the timeout was firing.
        }
      }, timeoutMs);
    }
  });
}

function createMaterialAnnotationStore(database: IDBDatabase): IDBObjectStore {
  const annotations = database.createObjectStore(STORES.materialAnnotations, { keyPath: "id" });
  annotations.createIndex("materialId", "materialId");
  annotations.createIndex("kind", "kind");
  annotations.createIndex("materialIdKind", ["materialId", "kind"]);
  return annotations;
}

function migrateContextualWordNotes(
  database: IDBDatabase,
  transaction: IDBTransaction,
  annotations: IDBObjectStore,
  reportError: (error: Error) => void,
): void {
  if (!database.objectStoreNames.contains(LEGACY_CONTEXTUAL_WORD_NOTES_STORE)) return;
  const request = transaction.objectStore(LEGACY_CONTEXTUAL_WORD_NOTES_STORE).getAll();
  request.addEventListener("success", () => {
    try {
      request.result.forEach((record: unknown) => {
        if (!isContextualWordNoteRecord(record)) {
          throw new Error("資料庫升級失敗：舊版情境單字筆記格式不正確。");
        }
        const writeRequest = annotations.put(contextualWordNoteToMaterialAnnotation(record));
        writeRequest.addEventListener("error", () => {
          reportError(new Error("資料庫升級失敗：舊版情境單字筆記無法寫入。"));
        }, { once: true });
      });
      database.deleteObjectStore(LEGACY_CONTEXTUAL_WORD_NOTES_STORE);
    } catch (error) {
      reportError(error instanceof Error ? error : new Error("資料庫升級失敗。"));
      transaction.abort();
    }
  }, { once: true });
  request.addEventListener("error", () => {
    reportError(new Error("資料庫升級失敗：無法讀取舊版情境單字筆記。"));
  }, { once: true });
}

function createSchema(
  database: IDBDatabase,
  transaction: IDBTransaction,
  reportError: (error: Error) => void,
): void {
  if (!database.objectStoreNames.contains(STORES.materials)) {
    const materials = database.createObjectStore(STORES.materials, { keyPath: "id" });
    materials.createIndex("updatedAt", "updatedAt");
    materials.createIndex("title", "title");

    const vocabulary = database.createObjectStore(STORES.vocabulary, { keyPath: "word" });
    vocabulary.createIndex("learned", "learned");
    vocabulary.createIndex("updatedAt", "updatedAt");

    database.createObjectStore(STORES.settings, { keyPath: "key" });
  }

  if (!database.objectStoreNames.contains(STORES.materialContents)) {
    database.createObjectStore(STORES.materialContents, { keyPath: "materialId" });
  }
  if (!database.objectStoreNames.contains(STORES.materialTerms)) {
    const materialTerms = database.createObjectStore(STORES.materialTerms, { keyPath: "materialId" });
    materialTerms.createIndex("word", "words", { multiEntry: true });
  }
  if (!database.objectStoreNames.contains(STORES.materialAssets)) {
    const materialAssets = database.createObjectStore(STORES.materialAssets, { keyPath: "id" });
    materialAssets.createIndex("materialId", "materialId");
  }
  if (!database.objectStoreNames.contains(STORES.wordNotes)) {
    database.createObjectStore(STORES.wordNotes, { keyPath: "word" });
  }
  const annotations = database.objectStoreNames.contains(STORES.materialAnnotations)
    ? transaction.objectStore(STORES.materialAnnotations)
    : createMaterialAnnotationStore(database);
  migrateContextualWordNotes(database, transaction, annotations, reportError);
}

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      let blocked = false;
      let upgradeError: Error | undefined;
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const transaction = request.transaction;
        if (!transaction) {
          upgradeError = new Error("資料庫升級失敗：缺少升級交易。");
          return;
        }
        createSchema(request.result, transaction, (error) => {
          upgradeError = error;
        });
      }, { once: true });
      request.addEventListener("success", () => {
        const database = request.result;
        if (blocked) {
          database.close();
          return;
        }
        database.addEventListener("versionchange", () => database.close());
        resolve(database);
      }, { once: true });
      request.addEventListener("error", () => {
        databasePromise = undefined;
        reject(upgradeError ?? request.error);
      }, { once: true });
      request.addEventListener("blocked", () => {
        blocked = true;
        databasePromise = undefined;
        reject(new Error("資料庫升級遭到其他分頁阻擋，請關閉其他英文學習庫分頁後重新整理。"));
      }, { once: true });
    });
  }
  return databasePromise;
}

export async function readAll<K extends StoreName>(
  storeName: K,
): Promise<StoreRecordMap[K][]> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).getAll());
}

export async function readAllByIndex<K extends StoreName>(
  storeName: K,
  indexName: string,
  key: IDBValidKey,
): Promise<StoreRecordMap[K][]> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).index(indexName).getAll(key));
}

export async function readOne<K extends StoreName>(
  storeName: K,
  key: IDBValidKey,
): Promise<StoreRecordMap[K] | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).get(key));
}

export async function readMany<K extends StoreName>(
  storeName: K,
  keys: IDBValidKey[],
): Promise<Array<StoreRecordMap[K] | undefined>> {
  if (keys.length === 0) return [];
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const completion = transactionResult(transaction);
  const store = transaction.objectStore(storeName);
  const [records] = await Promise.all([
    Promise.all(keys.map((key) => requestResult(store.get(key)))),
    completion,
  ]);
  return records;
}

export async function writeOne<K extends StoreName>(
  storeName: K,
  value: StoreRecordMap[K],
): Promise<StoreRecordMap[K]> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionResult(transaction);
  return value;
}

export async function writeMaterialContent(
  material: MaterialRecord,
  content: MaterialContentRecord,
  expectedUpdatedAt: string,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [STORES.materials, STORES.materialContents],
    "readwrite",
  );
  let conflictingUpdate = false;
  const materialStore = transaction.objectStore(STORES.materials);
  const request = materialStore.get(material.id);
  request.addEventListener("success", () => {
    const storedMaterial = request.result as MaterialRecord | undefined;
    if (!storedMaterial || storedMaterial.updatedAt !== expectedUpdatedAt) {
      conflictingUpdate = true;
      transaction.abort();
      return;
    }
    materialStore.put(material);
    transaction.objectStore(STORES.materialContents).put(content);
  }, { once: true });
  try {
    await transactionResult(transaction, 0, "中文解釋儲存失敗，教材內容未變更。");
  } catch (error) {
    if (conflictingUpdate) throw new Error("教材已在其他分頁更新，請重新載入後再編輯。");
    throw error;
  }
}

export async function deleteOne<K extends StoreName>(
  storeName: K,
  key: IDBValidKey,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionResult(transaction);
}

export async function writeMaterialHighlight(
  annotation: MaterialHighlightAnnotationRecord,
): Promise<MaterialHighlightAnnotationRecord> {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.materialAnnotations, "readwrite");
  let conflictingOccurrence = false;
  const store = transaction.objectStore(STORES.materialAnnotations);
  const request = store.index("materialIdKind").getAll([annotation.materialId, "highlight"]);
  request.addEventListener("success", () => {
    const selectedOccurrences = new Set(annotation.target.occurrenceKeys);
    const hasConflict = (request.result as MaterialAnnotationRecord[]).some((candidate) => (
      candidate.kind === "highlight"
      && candidate.id !== annotation.id
      && candidate.target.occurrenceKeys.some((key) => selectedOccurrences.has(key))
    ));
    if (hasConflict) {
      conflictingOccurrence = true;
      transaction.abort();
      return;
    }
    store.put(annotation);
  }, { once: true });
  try {
    await transactionResult(transaction, 0, "螢光標記儲存失敗，原有標記未變更。");
  } catch (error) {
    if (conflictingOccurrence) throw new Error("選取的單字已屬於另一組螢光標記。");
    throw error;
  }
  return annotation;
}

export async function writeMaterialBundles(bundles: MaterialBundle[]): Promise<void> {
  const assetsToStore = await Promise.all(
    bundles.flatMap((bundle) => bundle.assets ?? []).map(storedAsset),
  );
  const database = await openDatabase();
  const transaction = database.transaction(
    [STORES.materials, STORES.materialAssets, STORES.materialContents, STORES.materialTerms],
    "readwrite",
  );
  const materials = transaction.objectStore(STORES.materials);
  const assets = transaction.objectStore(STORES.materialAssets);
  const contents = transaction.objectStore(STORES.materialContents);
  const terms = transaction.objectStore(STORES.materialTerms);
  try {
    bundles.forEach((bundle) => {
      materials.put(bundle.metadata);
      contents.put({
        materialId: bundle.metadata.id,
        content: bundle.content,
        contentBlocks: bundle.contentBlocks,
      });
      terms.put({ materialId: bundle.metadata.id, words: bundle.words });
    });
    assetsToStore.forEach((asset) => assets.put(asset));
  } catch {
    transaction.abort();
    await transactionResult(transaction).catch(() => undefined);
    throw new Error("教材儲存失敗，未寫入任何資料。");
  }
  await transactionResult(transaction, 0, "教材儲存失敗，未寫入任何資料。");
}

export interface MaterialReplacementWrite {
  annotations: MaterialAnnotationRecord[];
  bundle: MaterialBundle;
  expectedUpdatedAt: string;
  vocabulary: VocabularyRecord[];
}

export async function replaceMaterialBundle({
  annotations,
  bundle,
  expectedUpdatedAt,
  vocabulary,
}: MaterialReplacementWrite): Promise<void> {
  const assetsToStore = await Promise.all((bundle.assets ?? []).map(storedAsset));
  const database = await openDatabase();
  const transaction = database.transaction(
    [
      STORES.materials,
      STORES.materialAssets,
      STORES.materialContents,
      STORES.materialTerms,
      STORES.vocabulary,
      STORES.materialAnnotations,
    ],
    "readwrite",
  );
  let conflictingUpdate = false;
  const materialStore = transaction.objectStore(STORES.materials);
  const materialRequest = materialStore.get(bundle.metadata.id);
  materialRequest.addEventListener("success", () => {
    const storedMaterial = materialRequest.result as MaterialRecord | undefined;
    if (!storedMaterial || storedMaterial.updatedAt !== expectedUpdatedAt) {
      conflictingUpdate = true;
      transaction.abort();
      return;
    }

    materialStore.put(bundle.metadata);
    transaction.objectStore(STORES.materialContents).put({
      materialId: bundle.metadata.id,
      content: bundle.content,
      contentBlocks: bundle.contentBlocks,
    });
    transaction.objectStore(STORES.materialTerms).put({
      materialId: bundle.metadata.id,
      words: bundle.words,
    });
    const vocabularyStore = transaction.objectStore(STORES.vocabulary);
    vocabulary.forEach((record) => vocabularyStore.put(record));

    const assetStore = transaction.objectStore(STORES.materialAssets);
    const assetRequest = assetStore.index("materialId").getAllKeys(bundle.metadata.id);
    assetRequest.addEventListener("success", () => {
      assetRequest.result.forEach((key) => assetStore.delete(key));
      assetsToStore.forEach((asset) => assetStore.put(asset));
    }, { once: true });

    const annotationStore = transaction.objectStore(STORES.materialAnnotations);
    const annotationRequest = annotationStore.index("materialId").getAllKeys(bundle.metadata.id);
    annotationRequest.addEventListener("success", () => {
      annotationRequest.result.forEach((key) => annotationStore.delete(key));
      annotations.forEach((annotation) => annotationStore.put(annotation));
    }, { once: true });
  }, { once: true });

  try {
    await transactionResult(transaction, 0, "教材更新失敗，原有資料未變更。");
  } catch (error) {
    if (conflictingUpdate) {
      throw new Error("這份教材已在其他分頁更新，請重新整理後再試。");
    }
    throw error;
  }
}

export type DeletedMaterialVocabularyReconciler = (
  deletedMaterial: MaterialRecord,
  remainingMaterials: MaterialRecord[],
  vocabulary: VocabularyRecord[],
  timestamp: string,
) => VocabularyRecord[];

export async function deleteMaterialBundle(
  materialId: string,
  reconcileVocabulary: DeletedMaterialVocabularyReconciler,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [
      STORES.materials,
      STORES.materialAssets,
      STORES.materialContents,
      STORES.materialTerms,
      STORES.materialAnnotations,
      STORES.vocabulary,
    ],
    "readwrite",
  );
  const materialStore = transaction.objectStore(STORES.materials);
  const vocabularyStore = transaction.objectStore(STORES.vocabulary);
  const materialRequest = materialStore.get(materialId);
  const materialsRequest = materialStore.getAll();
  const vocabularyRequest = vocabularyStore.getAll();
  let materials: MaterialRecord[] | undefined;
  let vocabulary: VocabularyRecord[] | undefined;

  const applyDeletion = (): void => {
    if (materials === undefined || vocabulary === undefined || materialRequest.readyState !== "done") {
      return;
    }
    try {
      const deletedMaterial = materialRequest.result as MaterialRecord | undefined;
      materialStore.delete(materialId);
      transaction.objectStore(STORES.materialContents).delete(materialId);
      transaction.objectStore(STORES.materialTerms).delete(materialId);
      if (deletedMaterial) {
        const remainingMaterials = materials.filter((material) => material.id !== materialId);
        reconcileVocabulary(
          deletedMaterial,
          remainingMaterials,
          vocabulary,
          new Date().toISOString(),
        ).forEach((record) => vocabularyStore.put(record));
      }
    } catch {
      transaction.abort();
    }
  };
  materialRequest.addEventListener("success", applyDeletion, { once: true });
  materialsRequest.addEventListener("success", () => {
    materials = materialsRequest.result;
    applyDeletion();
  }, { once: true });
  vocabularyRequest.addEventListener("success", () => {
    vocabulary = vocabularyRequest.result;
    applyDeletion();
  }, { once: true });
  const assetStore = transaction.objectStore(STORES.materialAssets);
  const assetRequest = assetStore.index("materialId").getAllKeys(materialId);
  assetRequest.addEventListener("success", () => {
    assetRequest.result.forEach((key) => assetStore.delete(key));
  }, { once: true });
  const annotationStore = transaction.objectStore(STORES.materialAnnotations);
  const annotationRequest = annotationStore.index("materialId").getAllKeys(materialId);
  annotationRequest.addEventListener("success", () => {
    annotationRequest.result.forEach((key) => annotationStore.delete(key));
  }, { once: true });
  await transactionResult(transaction, 0, "教材移除失敗，原有資料未變更。");
}

export async function writeLearningProgress(
  materials: MaterialRecord[],
  vocabulary: VocabularyRecord[],
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [STORES.materials, STORES.vocabulary],
    "readwrite",
  );
  const materialStore = transaction.objectStore(STORES.materials);
  const vocabularyStore = transaction.objectStore(STORES.vocabulary);
  materials.forEach((material) => materialStore.put(material));
  vocabulary.forEach((record) => vocabularyStore.put(record));
  await transactionResult(transaction);
}

export async function writeMaterialLearningProgress(
  material: MaterialRecord,
  vocabulary: VocabularyRecord[],
  expectedUpdatedAt: string,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [STORES.materials, STORES.vocabulary],
    "readwrite",
  );
  let conflictingUpdate = false;
  const materialStore = transaction.objectStore(STORES.materials);
  const currentMaterialRequest = materialStore.get(material.id);
  currentMaterialRequest.addEventListener("success", () => {
    const currentMaterial = currentMaterialRequest.result as MaterialRecord | undefined;
    if (!currentMaterial || currentMaterial.updatedAt !== expectedUpdatedAt) {
      conflictingUpdate = true;
      transaction.abort();
      return;
    }

    try {
      materialStore.put(material);
      const vocabularyStore = transaction.objectStore(STORES.vocabulary);
      vocabulary.forEach((record) => vocabularyStore.put(record));
    } catch {
      transaction.abort();
    }
  }, { once: true });

  try {
    await transactionResult(transaction, 0, "學習進度更新失敗，原有資料未變更。");
  } catch (error) {
    if (conflictingUpdate) {
      throw new Error("這份教材已在其他分頁更新，請重新整理後再試。");
    }
    throw error;
  }
}

export async function writeMaterialKnowledgeMigration(
  materials: MaterialRecord[],
  materialTerms: MaterialTermsRecord[],
  vocabulary: VocabularyRecord[],
  setting: SettingRecord,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [STORES.materials, STORES.materialTerms, STORES.vocabulary, STORES.settings],
    "readwrite",
  );
  const completion = transactionResult(transaction);
  const materialStore = transaction.objectStore(STORES.materials);
  const termStore = transaction.objectStore(STORES.materialTerms);
  const vocabularyStore = transaction.objectStore(STORES.vocabulary);
  try {
    materials.forEach((material) => materialStore.put(material));
    materialTerms.forEach((terms) => termStore.put(terms));
    vocabulary.forEach((record) => vocabularyStore.put(record));
    transaction.objectStore(STORES.settings).put(setting);
  } catch (error) {
    transaction.abort();
    await completion.catch(() => undefined);
    throw error;
  }
  await completion;
}

export async function writeBackupStores({
  materials,
  materialAssets = [],
  materialContents,
  materialTerms,
  vocabulary,
  materialAnnotations,
  wordNotes = [],
  settings,
}: BackupStoreRecords): Promise<void> {
  const assetsToStore = await Promise.all(materialAssets.map(storedAsset));
  const database = await openDatabase();
  const transaction = database.transaction(Object.values(STORES), "readwrite");
  const failureState: TransactionFailureState = { error: null };
  const trackRequest = <T>(request: IDBRequest<T>): void => {
    request.addEventListener("error", () => {
      failureState.error = request.error;
    }, { once: true });
  };
  const materialStore = transaction.objectStore(STORES.materials);
  const assetStore = transaction.objectStore(STORES.materialAssets);
  const vocabularyStore = transaction.objectStore(STORES.vocabulary);
  const settingsStore = transaction.objectStore(STORES.settings);
  const materialAnnotationStore = transaction.objectStore(STORES.materialAnnotations);
  const wordNoteStore = transaction.objectStore(STORES.wordNotes);
  const contentStore = transaction.objectStore(STORES.materialContents);
  const termStore = transaction.objectStore(STORES.materialTerms);

  try {
    Object.values(STORES).forEach((storeName) => {
      trackRequest(transaction.objectStore(storeName).clear());
    });
    materials.forEach((material) => trackRequest(materialStore.put(material)));
    assetsToStore.forEach((asset) => trackRequest(assetStore.put(asset)));
    materialContents.forEach((content) => trackRequest(contentStore.put(content)));
    materialTerms.forEach((terms) => trackRequest(termStore.put(terms)));
    vocabulary.forEach((record) => trackRequest(vocabularyStore.put(record)));
    materialAnnotations.forEach((record) => trackRequest(materialAnnotationStore.put(record)));
    wordNotes.forEach((record) => trackRequest(wordNoteStore.put(record)));
    settings.forEach((setting) => trackRequest(settingsStore.put(setting)));
  } catch (error) {
    transaction.abort();
    await transactionResult(transaction).catch(() => undefined);
    throw error;
  }
  await transactionResult(
    transaction,
    BACKUP_TRANSACTION_TIMEOUT_MS,
    "資料庫交易失敗，匯入資料未寫入。請重試或檢查瀏覽器儲存空間。",
    failureState,
  );
}
