import { expect, type Page } from "@playwright/test";

import { validWebpBase64 } from "./test-helpers";

export const CORE_STORE_NAMES = [
  "materialAssets",
  "materialAnnotations",
  "materialContents",
  "materialTerms",
  "materials",
  "settings",
  "vocabulary",
  "wordNotes",
] as const;

export type CoreStoreName = typeof CORE_STORE_NAMES[number];

export interface DatabaseSnapshot {
  stores: Record<CoreStoreName, unknown[]>;
  version: number;
}

export interface DatabaseSchemaSnapshot {
  stores: Array<{
    autoIncrement: boolean;
    indexes: Array<{
      keyPath: string | string[] | null;
      multiEntry: boolean;
      name: string;
      unique: boolean;
    }>;
    keyPath: string | string[] | null;
    name: string;
  }>;
  version: number;
}

export async function databaseSnapshot(page: Page): Promise<DatabaseSnapshot> {
  return page.evaluate(async (storeNames) => {
    const serialize = async (value: unknown): Promise<unknown> => {
      if (value instanceof Blob) {
        return {
          $type: "Blob",
          bytes: [...new Uint8Array(await value.arrayBuffer())],
          mimeType: value.type,
        };
      }
      if (value instanceof ArrayBuffer) {
        return {
          $type: "ArrayBuffer",
          bytes: [...new Uint8Array(value)],
        };
      }
      if (ArrayBuffer.isView(value)) {
        return {
          $type: value.constructor.name,
          bytes: [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)],
        };
      }
      if (Array.isArray(value)) return Promise.all(value.map(serialize));
      if (value !== null && typeof value === "object") {
        const entries = await Promise.all(
          Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(async ([key, entry]) => [key, await serialize(entry)] as const),
        );
        return Object.fromEntries(entries);
      }
      return value;
    };

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    try {
      const stores = Object.fromEntries(await Promise.all(storeNames.map(async (storeName) => {
        const records = await new Promise<unknown[]>((resolve, reject) => {
          const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
          request.addEventListener("success", () => resolve(request.result), { once: true });
          request.addEventListener("error", () => reject(request.error), { once: true });
        });
        const publicRecords = storeName === "settings"
          ? records.filter((record) => (
            typeof record !== "object"
            || record === null
            || !("key" in record)
            || record.key !== "readingContentClassificationVersion"
          ))
          : records;
        return [storeName, await serialize(publicRecords)] as const;
      }))) as Record<typeof storeNames[number], unknown[]>;
      return { stores, version: database.version };
    } finally {
      database.close();
    }
  }, CORE_STORE_NAMES);
}

export async function databaseSchemaSnapshot(page: Page): Promise<DatabaseSchemaSnapshot> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    try {
      const storeNames = [...database.objectStoreNames].sort();
      const transaction = database.transaction(storeNames, "readonly");
      const stores = storeNames.map((name) => {
        const store = transaction.objectStore(name);
        return {
          autoIncrement: store.autoIncrement,
          indexes: [...store.indexNames].sort().map((indexName) => {
            const index = store.index(indexName);
            return {
              keyPath: index.keyPath,
              multiEntry: index.multiEntry,
              name: index.name,
              unique: index.unique,
            };
          }),
          keyPath: store.keyPath,
          name,
        };
      });
      return { stores, version: database.version };
    } finally {
      database.close();
    }
  });
}

export async function importJsonBackup(
  page: Page,
  backup: unknown,
  fileName = "synthetic-backup.json",
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup), "utf8"),
  });
  await expect(page.getByRole("dialog", { name: "資料管理" }).getByRole("status"))
    .toContainText("備份已匯入");
}

export async function seedCompleteDatabase(page: Page, prefix: string): Promise<void> {
  const timestamp = "2026-08-12T08:00:00.000Z";
  await page.goto("/");
  await expect(page.locator(".material-grid")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(async ({ imageBase64, prefix, timestamp }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const materialId = prefix === "local"
      ? "11111111-1111-4111-8111-111111111111"
      : "22222222-2222-4222-8222-222222222222";
    const assetId = prefix === "local"
      ? "33333333-3333-4333-8333-333333333333"
      : "44444444-4444-4444-8444-444444444444";
    const annotationId = `${materialId}::vocabulary%3A${prefix}`;
    const bytes = Uint8Array.from(atob(imageBase64), (character) => character.charCodeAt(0));
    const content = `${prefix} reads.\n\n${prefix} 中文解釋。`;
    const contentBlocks = [
      { type: "text", text: `${prefix} reads.`, order: 0 },
      { type: "image", assetId, alt: `${prefix} image`, caption: `${prefix} caption`, order: 1 },
      { type: "text", text: `${prefix} 中文解釋。`, order: 2 },
    ];
    const transaction = database.transaction([
      "materialAssets",
      "materialAnnotations",
      "materialContents",
      "materialTerms",
      "materials",
      "settings",
      "vocabulary",
      "wordNotes",
    ], "readwrite");
    transaction.objectStore("materials").put({
      id: materialId,
      title: `${prefix} material`,
      description: `${prefix} description`,
      createdAt: timestamp,
      updatedAt: timestamp,
      wordCount: 2,
      knownCount: 1,
      knownWords: [prefix],
      readingParagraphKey: null,
    });
    transaction.objectStore("materialContents").put({ materialId, content, contentBlocks });
    transaction.objectStore("materialTerms").put({ materialId, words: [prefix, "reads"] });
    transaction.objectStore("materialAssets").put({
      id: assetId,
      materialId,
      blob: bytes.buffer,
      mimeType: "image/webp",
      width: 1,
      height: 1,
      alt: `${prefix} image`,
      caption: `${prefix} caption`,
    });
    transaction.objectStore("vocabulary").put({
      word: prefix,
      learned: true,
      learnedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.objectStore("materialAnnotations").put({
      id: annotationId,
      materialId,
      kind: "legacy-contextual-word-note",
      target: {
        type: "contextual-word-occurrence",
        occurrenceKey: `vocabulary:${prefix}`,
        word: prefix,
      },
      body: { format: "markdown", value: `${prefix} contextual note` },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.objectStore("wordNotes").put({
      word: prefix,
      markdown: `${prefix} shared note`,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.objectStore("settings").put({
      key: "searchHistory",
      value: [`${prefix} search`],
      updatedAt: timestamp,
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
    });
    database.close();
  }, { imageBase64: validWebpBase64, prefix, timestamp });
  await page.reload();
  await expect(page.getByRole("heading", { name: `${prefix} material` })).toBeVisible();
}
