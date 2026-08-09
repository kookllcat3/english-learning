import type {
  BackupStoreRecords,
  ContextualWordNoteRecord,
  MaterialAssetRecord,
  MaterialBundle,
  MaterialContentRecord,
  MaterialRecord,
  MaterialTermsRecord,
  SettingRecord,
  StoredMaterialAssetRecord,
  VocabularyRecord,
  WordNoteRecord,
} from "../models/models.js";

const DATABASE_NAME = "english-learning";
const DATABASE_VERSION = 8;
const BACKUP_TRANSACTION_TIMEOUT_MS = 60_000;

export const STORES = Object.freeze({
  contextualWordNotes: "contextualWordNotes",
  materialAssets: "materialAssets",
  materialContents: "materialContents",
  materialTerms: "materialTerms",
  materials: "materials",
  settings: "settings",
  vocabulary: "vocabulary",
  wordNotes: "wordNotes",
});

type StoreName = typeof STORES[keyof typeof STORES];

interface StoreRecordMap {
  contextualWordNotes: ContextualWordNoteRecord;
  materialAssets: StoredMaterialAssetRecord;
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

function createSchema(database: IDBDatabase): void {
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
  if (!database.objectStoreNames.contains(STORES.contextualWordNotes)) {
    const notes = database.createObjectStore(STORES.contextualWordNotes, { keyPath: "id" });
    notes.createIndex("materialId", "materialId");
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => createSchema(request.result), { once: true });
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
        reject(request.error);
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
  retainedContextualNoteIds?: ReadonlySet<string>,
): Promise<void> {
  const database = await openDatabase();
  const storeNames: StoreName[] = [STORES.materials, STORES.materialContents];
  if (retainedContextualNoteIds) storeNames.push(STORES.contextualWordNotes);
  const transaction = database.transaction(storeNames, "readwrite");
  transaction.objectStore(STORES.materials).put(material);
  transaction.objectStore(STORES.materialContents).put(content);
  if (retainedContextualNoteIds) {
    const noteStore = transaction.objectStore(STORES.contextualWordNotes);
    const request = noteStore.index("materialId").getAllKeys(material.id);
    request.addEventListener("success", () => {
      request.result
        .filter((key) => !retainedContextualNoteIds.has(String(key)))
        .forEach((key) => noteStore.delete(key));
    }, { once: true });
  }
  await transactionResult(transaction);
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
  await transactionResult(transaction);
}

export interface MaterialReplacementWrite {
  bundle: MaterialBundle;
  expectedUpdatedAt: string;
  retainedContextualNoteIds: ReadonlySet<string>;
  vocabulary: VocabularyRecord[];
}

export async function replaceMaterialBundle({
  bundle,
  expectedUpdatedAt,
  retainedContextualNoteIds,
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
      STORES.contextualWordNotes,
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

    const noteStore = transaction.objectStore(STORES.contextualWordNotes);
    const noteRequest = noteStore.index("materialId").getAllKeys(bundle.metadata.id);
    noteRequest.addEventListener("success", () => {
      noteRequest.result
        .filter((key) => !retainedContextualNoteIds.has(String(key)))
        .forEach((key) => noteStore.delete(key));
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

export async function deleteMaterialBundle(materialId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [
      STORES.materials,
      STORES.materialAssets,
      STORES.materialContents,
      STORES.materialTerms,
      STORES.contextualWordNotes,
    ],
    "readwrite",
  );
  transaction.objectStore(STORES.materials).delete(materialId);
  transaction.objectStore(STORES.materialContents).delete(materialId);
  transaction.objectStore(STORES.materialTerms).delete(materialId);
  const assetStore = transaction.objectStore(STORES.materialAssets);
  const assetRequest = assetStore.index("materialId").getAllKeys(materialId);
  assetRequest.addEventListener("success", () => {
    assetRequest.result.forEach((key) => assetStore.delete(key));
  }, { once: true });
  const noteStore = transaction.objectStore(STORES.contextualWordNotes);
  const noteRequest = noteStore.index("materialId").getAllKeys(materialId);
  noteRequest.addEventListener("success", () => {
    noteRequest.result.forEach((key) => noteStore.delete(key));
  }, { once: true });
  await transactionResult(transaction);
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
  contextualWordNotes,
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
  const contextualWordNoteStore = transaction.objectStore(STORES.contextualWordNotes);
  const wordNoteStore = transaction.objectStore(STORES.wordNotes);
  const contentStore = transaction.objectStore(STORES.materialContents);
  const termStore = transaction.objectStore(STORES.materialTerms);

  materials.forEach((material) => trackRequest(materialStore.put(material)));
  trackRequest(assetStore.clear());
  assetsToStore.forEach((asset) => trackRequest(assetStore.put(asset)));
  materialContents.forEach((content) => trackRequest(contentStore.put(content)));
  materialTerms.forEach((terms) => trackRequest(termStore.put(terms)));
  vocabulary.forEach((record) => trackRequest(vocabularyStore.put(record)));
  trackRequest(contextualWordNoteStore.clear());
  contextualWordNotes.forEach((record) => trackRequest(contextualWordNoteStore.put(record)));
  trackRequest(wordNoteStore.clear());
  wordNotes.forEach((record) => trackRequest(wordNoteStore.put(record)));
  settings.forEach((setting) => trackRequest(settingsStore.put(setting)));
  await transactionResult(
    transaction,
    BACKUP_TRANSACTION_TIMEOUT_MS,
    "資料庫交易失敗，匯入資料未寫入。請重試或檢查瀏覽器儲存空間。",
    failureState,
  );
}
