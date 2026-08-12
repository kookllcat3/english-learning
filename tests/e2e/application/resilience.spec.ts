import { expect, test, type Page } from "@playwright/test";

import { databaseSchemaSnapshot, databaseSnapshot } from "./data-integrity-helpers";
import { seedKnownWordsForCurrentMaterial, validWebpBase64 } from "./test-helpers";

const historicalTimestamp = "2026-01-01T00:00:00.000Z";
const historicalMaterialId = "55555555-5555-4555-8555-555555555555";
const historicalAssetId = "66666666-6666-4666-8666-666666666666";

async function seedHistoricalDatabase(
  page: Page,
  version: 6 | 7 | 8,
  keepConnectionOpen = false,
): Promise<void> {
  await page.goto("/tests/e2e/fixtures/same-origin.html");
  await page.evaluate(async ({
    assetId,
    imageBase64,
    keepConnectionOpen,
    materialId,
    timestamp,
    version,
  }) => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase("english-learning");
      deletion.addEventListener("success", () => resolve(), { once: true });
      deletion.addEventListener("error", () => reject(deletion.error), { once: true });
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("english-learning", version);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        const materials = database.createObjectStore("materials", { keyPath: "id" });
        materials.createIndex("updatedAt", "updatedAt");
        materials.createIndex("title", "title");
        const vocabulary = database.createObjectStore("vocabulary", { keyPath: "word" });
        vocabulary.createIndex("learned", "learned");
        vocabulary.createIndex("updatedAt", "updatedAt");
        database.createObjectStore("settings", { keyPath: "key" });
        database.createObjectStore("materialContents", { keyPath: "materialId" });
        const terms = database.createObjectStore("materialTerms", { keyPath: "materialId" });
        terms.createIndex("word", "words", { multiEntry: true });
        const assets = database.createObjectStore("materialAssets", { keyPath: "id" });
        assets.createIndex("materialId", "materialId");
        if (version === 6 || version === 8) {
          database.createObjectStore("wordNotes", { keyPath: "word" });
        }
        if (version >= 7) {
          const contextualNotes = database.createObjectStore("contextualWordNotes", { keyPath: "id" });
          contextualNotes.createIndex("materialId", "materialId");
        }

        const imageBytes = Uint8Array.from(atob(imageBase64), (character) => character.charCodeAt(0));
        const transaction = request.transaction;
        if (!transaction) throw new Error("Historical upgrade transaction is unavailable.");
        transaction.objectStore("materials").put({
          id: materialId,
          title: `DB v${version} 歷史教材`,
          description: "歷史 schema fixture",
          createdAt: timestamp,
          updatedAt: timestamp,
          wordCount: 2,
          knownCount: 1,
          knownWords: ["bear"],
        });
        transaction.objectStore("materialContents").put({
          materialId,
          content: "Bear learns.\n\n熊學習。",
          contentBlocks: [
            { type: "text", text: "Bear learns.", order: 0 },
            { type: "image", assetId, alt: "歷史圖片", caption: "歷史說明", order: 1 },
            { type: "text", text: "熊學習。", order: 2 },
          ],
        });
        transaction.objectStore("materialTerms").put({ materialId, words: ["bear", "learns"] });
        transaction.objectStore("materialAssets").put({
          id: assetId,
          materialId,
          blob: imageBytes.buffer,
          mimeType: "image/webp",
          width: 1,
          height: 1,
          alt: "歷史圖片",
          caption: "歷史說明",
        });
        transaction.objectStore("vocabulary").put({
          word: "bear",
          learned: true,
          learnedAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.objectStore("settings").put({
          key: "searchHistory",
          value: [`db-v${version}`],
          updatedAt: timestamp,
        });
        if (version === 6 || version === 8) {
          transaction.objectStore("wordNotes").put({
            word: "bear",
            markdown: `DB v${version} global note`,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
        if (version >= 7) {
          transaction.objectStore("contextualWordNotes").put({
            id: `${materialId}::vocabulary%3Abear`,
            materialId,
            occurrenceKey: "vocabulary:bear",
            word: "bear",
            markdown: `DB v${version} contextual note`,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
      }, { once: true });
      request.addEventListener("success", () => {
        if (keepConnectionOpen) {
          (globalThis as typeof globalThis & { legacyDatabase?: IDBDatabase }).legacyDatabase = request.result;
        } else {
          request.result.close();
        }
        resolve();
      }, { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
  }, {
    assetId: historicalAssetId,
    imageBase64: validWebpBase64,
    keepConnectionOpen,
    materialId: historicalMaterialId,
    timestamp: historicalTimestamp,
    version,
  });
}

function expectedCurrentSchema() {
  const store = (
    name: string,
    keyPath: string,
    indexes: Array<{
      keyPath: string | string[];
      multiEntry?: boolean;
      name: string;
      unique?: boolean;
    }> = [],
  ) => ({
    autoIncrement: false,
    indexes: indexes.map((index) => ({
      keyPath: index.keyPath,
      multiEntry: index.multiEntry ?? false,
      name: index.name,
      unique: index.unique ?? false,
    })),
    keyPath,
    name,
  });
  return {
    version: 9,
    stores: [
      store("materialAnnotations", "id", [
        { keyPath: "kind", name: "kind" },
        { keyPath: "materialId", name: "materialId" },
        { keyPath: ["materialId", "kind"], name: "materialIdKind" },
      ]),
      store("materialAssets", "id", [{ keyPath: "materialId", name: "materialId" }]),
      store("materialContents", "materialId"),
      store("materialTerms", "materialId", [{ keyPath: "words", multiEntry: true, name: "word" }]),
      store("materials", "id", [
        { keyPath: "title", name: "title" },
        { keyPath: "updatedAt", name: "updatedAt" },
      ]),
      store("settings", "key"),
      store("vocabulary", "word", [
        { keyPath: "learned", name: "learned" },
        { keyPath: "updatedAt", name: "updatedAt" },
      ]),
      store("wordNotes", "word"),
    ],
  };
}

async function createMaterial(page: Page, title: string, content: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "新增教材" }).click();
  await page.getByLabel("教材名稱（選填）").fill(title);
  await page.getByLabel("直接貼上文字").fill(content);
  await page.getByRole("button", { name: "儲存教材" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test("propagates material changes across tabs", async ({ page }) => {
  const secondPage = await page.context().newPage();
  await Promise.all([page.goto("/"), secondPage.goto("/")]);

  await page.getByRole("button", { name: "新增教材" }).click();
  await page.getByLabel("教材名稱（選填）").fill("跨分頁教材");
  await page.getByLabel("直接貼上文字").fill("Shared tab material.");
  await page.getByRole("button", { name: "儲存教材" }).click();

  await expect(secondPage.getByRole("heading", { name: "跨分頁教材" })).toBeVisible();
  await secondPage.close();
});

test("keeps local learning progress writable while offline", async ({ page, context }) => {
  await createMaterial(page, "離線教材", "A bear sleeps.");
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.getByRole("heading", { name: "離線教材", level: 1 })).toBeVisible();

  await context.setOffline(true);
  try {
    await seedKnownWordsForCurrentMaterial(page, ["bear"]);
  } finally {
    await context.setOffline(false);
  }

  await page.reload();
  await expect(page.locator('[data-word="bear"]').first()).toHaveClass(/known-word/);
});

for (const databaseVersion of [6, 7, 8] as const) {
  test(`upgrades the complete released DB v${databaseVersion} schema and data to v9`, async ({ page }) => {
    await seedHistoricalDatabase(page, databaseVersion);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: `DB v${databaseVersion} 歷史教材` })).toBeVisible();

    expect(await databaseSchemaSnapshot(page)).toEqual(expectedCurrentSchema());
    const snapshot = await databaseSnapshot(page);
    expect(snapshot.version).toBe(9);
    expect(snapshot.stores.materials).toEqual([{
      createdAt: historicalTimestamp,
      description: "歷史 schema fixture",
      id: historicalMaterialId,
      knownCount: 1,
      knownWords: ["bear"],
      readingParagraphKey: null,
      title: `DB v${databaseVersion} 歷史教材`,
      updatedAt: historicalTimestamp,
      wordCount: 2,
    }]);
    expect(snapshot.stores.materialContents).toEqual([{
      content: "Bear learns.\n\n熊學習。",
      contentBlocks: [
        { order: 0, text: "Bear learns.", type: "text" },
        {
          alt: "歷史圖片",
          assetId: historicalAssetId,
          caption: "歷史說明",
          order: 1,
          type: "image",
        },
        { order: 2, text: "熊學習。", type: "text" },
      ],
      materialId: historicalMaterialId,
    }]);
    expect(snapshot.stores.materialTerms).toEqual([{
      materialId: historicalMaterialId,
      words: ["bear", "learns"],
    }]);
    expect(snapshot.stores.materialAssets).toEqual([expect.objectContaining({
      alt: "歷史圖片",
      caption: "歷史說明",
      id: historicalAssetId,
      materialId: historicalMaterialId,
      mimeType: "image/webp",
      width: 1,
      height: 1,
    })]);
    expect(snapshot.stores.vocabulary).toEqual([{
      learned: true,
      learnedAt: historicalTimestamp,
      updatedAt: historicalTimestamp,
      word: "bear",
    }]);
    expect(snapshot.stores.settings).toEqual([{
      key: "searchHistory",
      updatedAt: historicalTimestamp,
      value: [`db-v${databaseVersion}`],
    }]);
    expect(snapshot.stores.wordNotes).toEqual(databaseVersion === 7 ? [] : [{
      createdAt: historicalTimestamp,
      markdown: `DB v${databaseVersion} global note`,
      updatedAt: historicalTimestamp,
      word: "bear",
    }]);
    expect(snapshot.stores.materialAnnotations).toEqual(databaseVersion === 6 ? [] : [{
      body: { format: "markdown", value: `DB v${databaseVersion} contextual note` },
      createdAt: historicalTimestamp,
      id: `${historicalMaterialId}::vocabulary%3Abear`,
      kind: "legacy-contextual-word-note",
      materialId: historicalMaterialId,
      target: {
        occurrenceKey: "vocabulary:bear",
        type: "contextual-word-occurrence",
        word: "bear",
      },
      updatedAt: historicalTimestamp,
    }]);
  });
}

test("upgrades a version 1 IndexedDB material in place", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/same-origin.html");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("english-learning");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("english-learning", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        const materials = database.createObjectStore("materials", { keyPath: "id" });
        materials.createIndex("updatedAt", "updatedAt");
        materials.createIndex("title", "title");
        const vocabulary = database.createObjectStore("vocabulary", { keyPath: "word" });
        vocabulary.createIndex("learned", "learned");
        vocabulary.createIndex("updatedAt", "updatedAt");
        database.createObjectStore("settings", { keyPath: "key" });
        materials.put({
          id: "82b5d947-cf8a-4225-98e5-09672ea30bf6",
          title: "舊資料庫教材",
          description: "",
          content: "Animal",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        });
        vocabulary.put({
          word: "animal",
          learned: true,
          learnedAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });

  await page.goto("/");
  const migratedCard = page.getByRole("article").filter({ hasText: "舊資料庫教材" });
  await expect(migratedCard).toContainText("1 / 1");
  await migratedCard.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.getByText("Animal", { exact: true })).toBeVisible();
});

test("migrates version 8 contextual notes while preserving global word notes", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/same-origin.html");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase("english-learning");
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("english-learning", 8);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore("materials", { keyPath: "id" });
        database.createObjectStore("vocabulary", { keyPath: "word" });
        database.createObjectStore("settings", { keyPath: "key" }).put({
          key: "searchHistory",
          value: ["preserved"],
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
        database.createObjectStore("wordNotes", { keyPath: "word" }).put({
          word: "driver",
          markdown: "legacy global note",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
        const contextualNotes = database.createObjectStore("contextualWordNotes", { keyPath: "id" });
        contextualNotes.createIndex("materialId", "materialId");
        contextualNotes.put({
          id: "material::vocabulary%3Adriver",
          materialId: "material",
          occurrenceKey: "vocabulary:driver",
          word: "driver",
          markdown: "legacy contextual note",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });

  await page.goto("/");
  await expect(page.getByRole("link", { name: "回到英文學習庫首頁" })).toBeVisible();
  await expect(page.locator(".material-grid")).toHaveAttribute("aria-busy", "false");
  await page.goto("/tests/e2e/fixtures/same-origin.html");
  const state = await page.evaluate(async () => new Promise<{
    stores: string[];
    version: number;
    preservedNote: unknown;
    migratedContextualNote: unknown;
    preservedSetting: unknown;
  }>((resolve, reject) => {
    const request = indexedDB.open("english-learning");
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(["settings", "wordNotes", "materialAnnotations"], "readonly");
      const settingRequest = transaction.objectStore("settings").get("searchHistory");
      const noteRequest = transaction.objectStore("wordNotes").get("driver");
      const contextualNoteRequest = transaction.objectStore("materialAnnotations")
        .get("material::vocabulary%3Adriver");
      transaction.oncomplete = () => {
        resolve({
          stores: [...database.objectStoreNames],
          version: database.version,
          preservedNote: noteRequest.result,
          migratedContextualNote: contextualNoteRequest.result,
          preservedSetting: settingRequest.result,
        });
        database.close();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  }));

  expect(state.version).toBe(9);
  expect(state.stores).not.toContain("contextualWordNotes");
  expect(state.stores).toContain("materialAnnotations");
  expect(state.stores).toContain("wordNotes");
  expect(state.preservedNote).toMatchObject({ markdown: "legacy global note", word: "driver" });
  expect(state.migratedContextualNote).toMatchObject({
    body: { format: "markdown", value: "legacy contextual note" },
    kind: "legacy-contextual-word-note",
    materialId: "material",
    target: {
      occurrenceKey: "vocabulary:driver",
      type: "contextual-word-occurrence",
      word: "driver",
    },
  });
  expect(state.preservedSetting).toMatchObject({ value: ["preserved"] });
});

test("rolls back the version 8 upgrade when a contextual note is malformed", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/same-origin.html");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase("english-learning");
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("english-learning", 8);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore("materials", { keyPath: "id" });
        database.createObjectStore("vocabulary", { keyPath: "word" });
        database.createObjectStore("settings", { keyPath: "key" });
        database.createObjectStore("wordNotes", { keyPath: "word" });
        database.createObjectStore("materialContents", { keyPath: "materialId" });
        database.createObjectStore("materialTerms", { keyPath: "materialId" });
        database.createObjectStore("materialAssets", { keyPath: "id" });
        database.createObjectStore("contextualWordNotes", { keyPath: "id" }).put({
          id: "malformed-note",
          materialId: "material",
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });

  await page.goto("/");
  await expect(page.getByText(/舊版情境單字筆記格式不正確/)).toBeVisible();
  const state = await page.evaluate(async () => new Promise<{ stores: string[]; version: number }>(
    (resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.onsuccess = () => {
        resolve({
          stores: [...request.result.objectStoreNames],
          version: request.result.version,
        });
        request.result.close();
      };
      request.onerror = () => reject(request.error);
    },
  ));
  expect(state.version).toBe(8);
  expect(state.stores).toContain("contextualWordNotes");
  expect(state.stores).not.toContain("materialAnnotations");
});

test("reports a blocked database upgrade and succeeds after the old connection closes", async ({ page }) => {
  await seedHistoricalDatabase(page, 6, true);

  const blockedMessage = await page.evaluate(async () => {
    const databaseModulePath = "/src/core/database/database.ts";
    const database = await import(databaseModulePath);
    return database.readAll(database.STORES.materials).then(
      () => "",
      (error: unknown) => error instanceof Error ? error.message : String(error),
    );
  });
  expect(blockedMessage).toContain("其他英文學習庫分頁");

  await page.evaluate(() => {
    (window as typeof window & { legacyDatabase?: IDBDatabase }).legacyDatabase?.close();
  });
  const stores = await page.evaluate(async () => {
    const databaseModulePath = "/src/core/database/database.ts";
    const database = await import(databaseModulePath);
    await database.readAll(database.STORES.materials);
    return new Promise<string[]>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.onsuccess = () => {
        resolve([...request.result.objectStoreNames]);
        request.result.close();
      };
      request.onerror = () => reject(request.error);
    });
  });
  expect(stores).toContain("materialAnnotations");
  expect(stores).toContain("wordNotes");
});
