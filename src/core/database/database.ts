import type {
  BackupStoreRecords,
  MaterialAssetRecord,
  MaterialBundle,
  MaterialContentRecord,
  MaterialRecord,
  MaterialTermsRecord,
  SettingRecord,
  VocabularyRecord,
  WordNoteRecord,
} from "../models/models.js";

const DATABASE_NAME = "english-learning";
const DATABASE_VERSION = 6;

export const STORES = Object.freeze({
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
  materialAssets: MaterialAssetRecord;
  materialContents: MaterialContentRecord;
  materialTerms: MaterialTermsRecord;
  materials: MaterialRecord;
  settings: SettingRecord;
  vocabulary: VocabularyRecord;
  wordNotes: WordNoteRecord;
}

let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
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
}

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => createSchema(request.result), { once: true });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
      request.addEventListener("blocked", () => {
        reject(new Error("資料庫正在被其他分頁使用，請關閉其他分頁後重試。"));
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

export async function writeMaterialBundles(bundles: MaterialBundle[]): Promise<void> {
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
    (bundle.assets ?? []).forEach((asset) => assets.put(asset));
  });
  await transactionResult(transaction);
}

export async function deleteMaterialBundle(materialId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [STORES.materials, STORES.materialAssets, STORES.materialContents, STORES.materialTerms],
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
  wordNotes,
  settings,
}: BackupStoreRecords): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(Object.values(STORES), "readwrite");
  const materialStore = transaction.objectStore(STORES.materials);
  const assetStore = transaction.objectStore(STORES.materialAssets);
  const vocabularyStore = transaction.objectStore(STORES.vocabulary);
  const settingsStore = transaction.objectStore(STORES.settings);
  const wordNoteStore = transaction.objectStore(STORES.wordNotes);
  const contentStore = transaction.objectStore(STORES.materialContents);
  const termStore = transaction.objectStore(STORES.materialTerms);

  materials.forEach((material) => materialStore.put(material));
  assetStore.clear();
  materialAssets.forEach((asset) => assetStore.put(asset));
  materialContents.forEach((content) => contentStore.put(content));
  materialTerms.forEach((terms) => termStore.put(terms));
  vocabulary.forEach((record) => vocabularyStore.put(record));
  wordNotes.forEach((record) => wordNoteStore.put(record));
  settings.forEach((setting) => settingsStore.put(setting));
  await transactionResult(transaction);
}
