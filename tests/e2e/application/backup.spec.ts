import { expect, test } from "@playwright/test";

import {
  CORE_STORE_NAMES,
  databaseSnapshot,
  importJsonBackup,
  seedCompleteDatabase,
} from "./data-integrity-helpers";
import {
  createMaterial,
  materialTitle,
  storedContextualNotes,
  storedHighlights,
  storedSettingValue,
  storedWordNotes,
  validWebpBase64,
} from "./test-helpers";

const fixedTimestamp = "2026-08-12T08:00:00.000Z";

function completeBackupFixture(prefix = "incoming") {
  const materialId = "22222222-2222-4222-8222-222222222222";
  const assetId = "44444444-4444-4444-8444-444444444444";
  const content = `${prefix} reads.\n\n${prefix} 中文解釋。`;
  return {
    schemaVersion: 6,
    exportedAt: fixedTimestamp,
    materials: [{
      id: materialId,
      title: `${prefix} material`,
      description: `${prefix} description`,
      content,
      contentBlocks: [
        { type: "text", text: `${prefix} reads.`, order: 0 },
        {
          type: "image",
          assetId,
          alt: `${prefix} image`,
          caption: `${prefix} caption`,
          order: 1,
        },
        { type: "text", text: `${prefix} 中文解釋。`, order: 2 },
      ],
      knownWords: [prefix],
      readingParagraphKey: null,
      createdAt: fixedTimestamp,
      updatedAt: fixedTimestamp,
    }],
    materialAssets: [{
      id: assetId,
      materialId,
      mimeType: "image/webp",
      width: 1,
      height: 1,
      alt: `${prefix} image`,
      caption: `${prefix} caption`,
      data: `data:image/webp;base64,${validWebpBase64}`,
    }],
    vocabulary: [{
      word: prefix,
      learned: true,
      learnedAt: fixedTimestamp,
      createdAt: fixedTimestamp,
      updatedAt: fixedTimestamp,
    }],
    materialAnnotations: [{
      id: `${materialId}::vocabulary%3A${prefix}`,
      materialId,
      kind: "legacy-contextual-word-note",
      target: {
        type: "contextual-word-occurrence",
        occurrenceKey: `vocabulary:${prefix}`,
        word: prefix,
      },
      body: { format: "markdown", value: `${prefix} contextual note` },
      createdAt: fixedTimestamp,
      updatedAt: fixedTimestamp,
    }],
    wordNotes: [{
      word: prefix,
      markdown: `${prefix} shared note`,
      createdAt: fixedTimestamp,
      updatedAt: fixedTimestamp,
    }],
    settings: [{
      key: "searchHistory",
      value: [`${prefix} search`],
      updatedAt: fixedTimestamp,
    }],
  };
}

function legacyBackupFixture(schemaVersion: number) {
  const materialId = `00000000-0000-4000-8000-00000000000${schemaVersion}`;
  const backup: Record<string, unknown> = {
    schemaVersion,
    exportedAt: fixedTimestamp,
    materials: [{
      id: materialId,
      title: `Schema ${schemaVersion} 教材`,
      description: "歷史備份相容性",
      content: "Bear learns.",
      knownWords: ["bear"],
      createdAt: fixedTimestamp,
      updatedAt: fixedTimestamp,
    }],
    materialAssets: [],
    vocabulary: [{
      word: "bear",
      learned: true,
      learnedAt: fixedTimestamp,
      updatedAt: fixedTimestamp,
    }],
    settings: [{
      key: "searchHistory",
      value: [`schema-${schemaVersion}`],
      updatedAt: fixedTimestamp,
    }],
  };
  if (schemaVersion === 4) {
    backup.contextualWordNotes = [{
      id: `${materialId}::vocabulary%3Abear`,
      materialId,
      occurrenceKey: "vocabulary:bear",
      word: "bear",
      markdown: "schema 4 contextual note",
      createdAt: fixedTimestamp,
      updatedAt: fixedTimestamp,
    }];
  }
  if (schemaVersion >= 5) {
    backup.wordNotes = [{
      word: "bear",
      markdown: `schema ${schemaVersion} shared note`,
      createdAt: fixedTimestamp,
      updatedAt: fixedTimestamp,
    }];
  }
  if (schemaVersion === 6) {
    backup.materialAnnotations = [{
      id: `${materialId}::vocabulary%3Abear`,
      materialId,
      kind: "legacy-contextual-word-note",
      target: {
        type: "contextual-word-occurrence",
        occurrenceKey: "vocabulary:bear",
        word: "bear",
      },
      body: { format: "markdown", value: "schema 6 contextual note" },
      createdAt: fixedTimestamp,
      updatedAt: fixedTimestamp,
    }];
  }
  return backup;
}

test("round-trips all eight stores and replaces every existing record", async ({ browser, page }) => {
  const sourceContext = await browser.newContext({ baseURL: "http://127.0.0.1:4173" });
  const sourcePage = await sourceContext.newPage();
  try {
    await seedCompleteDatabase(sourcePage, "incoming");
    const expected = await databaseSnapshot(sourcePage);
    CORE_STORE_NAMES.forEach((storeName) => expect(expected.stores[storeName]).not.toEqual([]));

    await sourcePage.getByRole("button", { name: "開啟資料管理" }).click();
    const downloadPromise = sourcePage.waitForEvent("download");
    await sourcePage.getByRole("button", { name: "下載備份" }).click();
    const backupDownload = await downloadPromise;
    const backupPath = await backupDownload.path();
    if (!backupPath) throw new Error("Synthetic complete backup was not downloaded.");

    await seedCompleteDatabase(page, "local");
    const localSnapshot = await databaseSnapshot(page);
    CORE_STORE_NAMES.forEach((storeName) => expect(localSnapshot.stores[storeName]).not.toEqual([]));
    expect(JSON.stringify(localSnapshot)).toContain("local");

    await page.getByRole("button", { name: "開啟資料管理" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('.data-management-dialog input[type="file"]').setInputFiles(backupPath);
    await expect(page.getByRole("dialog", { name: "資料管理" }).getByRole("status"))
      .toContainText("備份已匯入");

    const restored = await databaseSnapshot(page);
    expect(restored).toEqual(expected);
    expect(JSON.stringify(restored)).not.toContain("local");
  } finally {
    await sourceContext.close();
  }
});

for (const schemaVersion of [1, 2, 3, 4, 5, 6]) {
  test(`imports backup schema ${schemaVersion} into the exact current database shape`, async ({ page }) => {
    const materialId = `00000000-0000-4000-8000-00000000000${schemaVersion}`;
    await importJsonBackup(page, legacyBackupFixture(schemaVersion), `schema-${schemaVersion}.json`);
    const snapshot = await databaseSnapshot(page);

    expect(snapshot.version).toBe(9);
    expect(snapshot.stores.materials).toEqual([{
      createdAt: fixedTimestamp,
      description: "歷史備份相容性",
      id: materialId,
      knownCount: 1,
      knownWords: ["bear"],
      readingParagraphKey: null,
      title: `Schema ${schemaVersion} 教材`,
      updatedAt: fixedTimestamp,
      wordCount: 2,
    }]);
    expect(snapshot.stores.materialContents).toEqual([{
      content: "Bear learns.",
      contentBlocks: [{ order: 0, text: "Bear learns.", type: "text" }],
      materialId,
    }]);
    expect(snapshot.stores.materialTerms).toEqual([{ materialId, words: ["bear", "learns"] }]);
    expect(snapshot.stores.materialAssets).toEqual([]);
    expect(snapshot.stores.vocabulary).toEqual([{
      learned: true,
      learnedAt: fixedTimestamp,
      updatedAt: fixedTimestamp,
      word: "bear",
    }]);
    expect(snapshot.stores.settings).toEqual([{
      key: "searchHistory",
      updatedAt: fixedTimestamp,
      value: [`schema-${schemaVersion}`],
    }]);
    expect(snapshot.stores.materialAnnotations).toHaveLength([4, 6].includes(schemaVersion) ? 1 : 0);
    expect(snapshot.stores.wordNotes).toHaveLength(schemaVersion >= 5 ? 1 : 0);
  });
}

const backupWriteFailures = [
  { mode: "clear", label: "store clear throws" },
  { mode: "put", label: "store put throws" },
  { mode: "quota", label: "asset quota is exceeded" },
  { mode: "abort", label: "transaction aborts" },
] as const;

for (const failure of backupWriteFailures) {
  test(`rolls back all eight stores when backup ${failure.label}`, async ({ page }) => {
    await page.addInitScript((mode) => {
      const failureEnabled = () => sessionStorage.getItem("failCompleteBackupImport") === "true";
      const originalClear = IDBObjectStore.prototype.clear;
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.clear = function clear() {
        if (failureEnabled() && mode === "clear" && this.name === "vocabulary") {
          throw new DOMException("Synthetic clear failure", "UnknownError");
        }
        return originalClear.call(this);
      };
      IDBObjectStore.prototype.put = function put(value: unknown, key?: IDBValidKey) {
        const matchesPut = mode === "put" && this.name === "materialContents";
        const matchesQuota = mode === "quota" && this.name === "materialAssets";
        if (failureEnabled() && matchesPut) {
          throw new DOMException("Synthetic put failure", "UnknownError");
        }
        if (failureEnabled() && matchesQuota) {
          throw new DOMException("Synthetic quota failure", "QuotaExceededError");
        }
        const request = key === undefined
          ? originalPut.call(this, value)
          : originalPut.call(this, value, key);
        if (failureEnabled() && mode === "abort" && this.name === "settings") {
          this.transaction.abort();
        }
        return request;
      };
    }, failure.mode);

    await seedCompleteDatabase(page, "local");
    const before = await databaseSnapshot(page);
    await page.evaluate(() => sessionStorage.setItem("failCompleteBackupImport", "true"));
    await page.getByRole("button", { name: "開啟資料管理" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
      name: `failed-${failure.mode}-backup.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(completeBackupFixture()), "utf8"),
    });

    await expect(page.getByRole("dialog", { name: "資料管理" }).getByRole("alert"))
      .toContainText("備份匯入失敗");
    expect(await databaseSnapshot(page)).toEqual(before);
  });
}

test("exports, removes, and restores a complete backup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "查看教材製作教學" }).click();
  const guideDialog = page.getByRole("dialog", { name: "如何製作學習教材" });
  await guideDialog.getByLabel("純文字教材生成提示詞").fill("備份中的純文字教材提示詞");
  await expect(guideDialog.getByRole("status")).toContainText("純文字提示詞已儲存");
  await guideDialog.getByRole("button", { name: "關閉" }).click();

  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  const firstParagraph = page.locator("[data-reading-paragraph]").first();
  await firstParagraph.getByRole("button", { name: "將閱讀書籤設在此段" }).click();
  await page.getByRole("button", { name: "螢光筆" }).click();
  await firstParagraph.locator('[data-word="bear"]').first().click();
  await expect.poll(() => storedHighlights(page)).toHaveLength(1);
  await page.keyboard.press("Escape");
  await page.locator('[data-word="bear"]').first().focus();
  await page.getByLabel("單字 Markdown 筆記").fill("備份中的共用單字筆記");
  await expect(page.getByRole("status")).toHaveText("已儲存");
  await expect.poll(async () => (await storedWordNotes(page)).map(({ markdown }) => markdown))
    .toContain("備份中的共用單字筆記");
  const savedNote = (await storedWordNotes(page)).find(
    ({ markdown }) => markdown === "備份中的共用單字筆記",
  );
  expect(savedNote).toBeDefined();
  await page.getByRole("button", { name: "開啟 AI 輔助學習" }).click();
  await page.getByLabel("可編輯提示詞").fill("備份中的自訂 AI 提示詞");
  await expect.poll(() => storedSettingValue(page, "aiPrompt"))
    .toBe("備份中的自訂 AI 提示詞");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("link", { name: "回到英文學習庫首頁" }).click();

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction("settings", "readwrite");
    transaction.objectStore("settings").put({
      key: "familiarityColor",
      value: "#abcdef",
      updatedAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
    database.close();
  });

  await page.getByRole("button", { name: "開啟資料管理" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下載備份" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();
  await expect(page.getByRole("status")).toContainText("備份已下載");
  await page.getByRole("button", { name: "關閉", exact: true }).click();

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction("settings", "readwrite");
    const settings = transaction.objectStore("settings");
    settings.delete("aiPrompt");
    settings.delete("materialGuideTextPrompt");
    settings.delete("familiarityColor");
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
    database.close();
  });

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("article")
    .filter({ hasText: materialTitle })
    .getByRole("button", { name: "移除" })
    .click();
  await expect(page.getByRole("heading", { name: materialTitle })).toHaveCount(0);
  const remainingNotes = await page.evaluate(async () => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("english-learning");
    request.onsuccess = () => {
      const database = request.result;
      const count = database.transaction("wordNotes", "readonly")
        .objectStore("wordNotes")
        .count();
      count.onsuccess = () => {
        resolve(count.result);
        database.close();
      };
      count.onerror = () => reject(count.error);
    };
    request.onerror = () => reject(request.error);
  }));
  expect(remainingNotes).toBe(1);
  await expect.poll(() => storedHighlights(page)).toEqual([]);

  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]')
    .setInputFiles(backupPath as string);

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("備份已匯入");
  await expect.poll(async () => (await storedWordNotes(page)).map(({ markdown }) => markdown))
    .toContain("備份中的共用單字筆記");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.getByRole("button", { name: "回到閱讀書籤" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除此段閱讀書籤" })).toBeVisible();
  await expect(page.locator('[data-word="bear"]').first()).toHaveClass(/is-highlighted/);
  await expect.poll(() => storedHighlights(page)).toHaveLength(1);
  const restoredNotes = await storedWordNotes(page);
  expect(restoredNotes).toContainEqual(savedNote);
  await page.locator(`[data-word="${savedNote?.word}"]`).first().focus();
  await expect(page.getByLabel("單字 Markdown 筆記")).toHaveText("備份中的共用單字筆記");
  await page.getByRole("button", { name: "開啟 AI 輔助學習" }).click();
  await expect(page.getByLabel("可編輯提示詞")).toHaveValue("備份中的自訂 AI 提示詞");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("link", { name: "回到英文學習庫首頁" }).click();
  await page.getByRole("button", { name: "查看教材製作教學" }).click();
  await expect(guideDialog.getByLabel("純文字教材生成提示詞"))
    .toHaveValue("備份中的純文字教材提示詞");
  const restoredLegacyColor = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const request = database.transaction("settings", "readonly")
      .objectStore("settings").get("familiarityColor");
    const result = await new Promise<{ value?: unknown } | undefined>((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    database.close();
    return result?.value;
  });
  expect(restoredLegacyColor).toBe("#abcdef");
});

test("reports an invalid backup without changing the library", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("button", { name: "開啟資料管理" }).click();

  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "invalid-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from("{invalid json", "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("alert")).toContainText("JSON");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
});

test("rejects invalid version 6 highlight records before writing", async ({ page }) => {
  const timestamp = "2026-08-09T08:00:00.000Z";
  const materialId = "37f59d40-4f5f-4fc2-ac4d-515719319ba2";
  await page.goto("/");
  await page.getByRole("button", { name: "開啟資料管理" }).click();
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "invalid-highlight-v6.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 6,
      exportedAt: timestamp,
      materials: [{
        id: materialId,
        title: "不應匯入的教材",
        description: "",
        content: "A bear runs.",
        contentBlocks: [{ type: "text", text: "A bear runs.", order: 0 }],
        knownWords: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      materialAssets: [],
      vocabulary: [],
      materialAnnotations: [{
        id: "df52b38d-02eb-4e99-a13e-320742f73803",
        materialId,
        kind: "highlight",
        target: {
          type: "reading-word-occurrences",
          paragraphKey: "0-0-0",
          occurrenceKeys: ["0-0-0-0-0"],
        },
        style: { color: "orange" },
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      wordNotes: [],
      settings: [],
    }), "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("alert")).toContainText("螢光標記");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: "不應匯入的教材" })).toHaveCount(0);
});

test("replaces local highlights with the imported set for an included material", async ({ page }) => {
  const localHighlightId = "5f459dcf-f9ad-47b4-82e7-49bd7e6815bb";
  const importedHighlightId = "629ac0af-51ef-4f67-9895-35a477bd8b58";
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const firstParagraph = page.locator("[data-reading-paragraph]").first();
  const localWord = firstParagraph.locator('[data-word="bear"]').first();
  const importedWord = firstParagraph.locator('[data-word="runs"]').first();
  const paragraphKey = await localWord.getAttribute("data-paragraph-key");
  const localOccurrenceKey = await localWord.getAttribute("data-word-key");
  const importedOccurrenceKey = await importedWord.getAttribute("data-word-key");
  expect(paragraphKey).not.toBeNull();
  expect(localOccurrenceKey).not.toBeNull();
  expect(importedOccurrenceKey).not.toBeNull();

  const backup = await page.evaluate(async ({
    importedHighlightId,
    importedOccurrenceKey,
    localHighlightId,
    localOccurrenceKey,
    paragraphKey,
  }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const readAll = <T>(storeName: string) => new Promise<T[]>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const [materials, contents] = await Promise.all([
      readAll<Record<string, unknown>>("materials"),
      readAll<Record<string, unknown>>("materialContents"),
    ]);
    const material = materials[0];
    const content = contents[0];
    if (!material || !content) throw new Error("test material was not stored");
    const materialId = String(material.id);
    const timestamp = "2026-08-09T08:00:00.000Z";
    const transaction = database.transaction("materialAnnotations", "readwrite");
    transaction.objectStore("materialAnnotations").put({
      id: localHighlightId,
      materialId,
      kind: "highlight",
      target: {
        type: "reading-word-occurrences",
        paragraphKey,
        occurrenceKeys: [localOccurrenceKey],
      },
      style: { color: "yellow" },
      createdAt: "2026-08-09T10:00:00.000Z",
      updatedAt: "2026-08-09T10:00:00.000Z",
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
    database.close();
    return {
      schemaVersion: 6,
      exportedAt: timestamp,
      materials: [{
        ...material,
        content: content.content,
        contentBlocks: content.contentBlocks,
      }],
      materialAssets: [],
      vocabulary: [],
      materialAnnotations: [{
        id: importedHighlightId,
        materialId,
        kind: "highlight",
        target: {
          type: "reading-word-occurrences",
          paragraphKey,
          occurrenceKeys: [importedOccurrenceKey],
        },
        style: { color: "yellow" },
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      wordNotes: [],
      settings: [],
    };
  }, {
    importedHighlightId,
    importedOccurrenceKey: importedOccurrenceKey!,
    localHighlightId,
    localOccurrenceKey: localOccurrenceKey!,
    paragraphKey: paragraphKey!,
  });
  await expect.poll(() => storedHighlights(page)).toEqual([{
    id: localHighlightId,
    occurrenceKeys: [localOccurrenceKey],
    paragraphKey,
  }]);

  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "authoritative-highlights-v6.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup), "utf8"),
  });

  await expect.poll(() => storedHighlights(page)).toEqual([{
    id: importedHighlightId,
    occurrenceKeys: [importedOccurrenceKey],
    paragraphKey,
  }]);
});

test("replaces all local records with the imported backup", async ({ page }) => {
  const timestamp = "2026-08-05T08:00:00.000Z";
  await createMaterial(page);
  await page.evaluate(async ({ timestamp }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const materialRequest = database.transaction("materials", "readonly")
      .objectStore("materials")
      .getAll();
    const materials = await new Promise<Array<{ id: string }>>((resolve, reject) => {
      materialRequest.addEventListener("success", () => resolve(materialRequest.result), { once: true });
      materialRequest.addEventListener("error", () => reject(materialRequest.error), { once: true });
    });
    const materialId = materials[0]?.id;
    if (!materialId) throw new Error("test material not found");
    const transaction = database.transaction("materialAnnotations", "readwrite");
    transaction.objectStore("materialAnnotations").put({
      id: `${materialId}::reading%3Amissing-position`,
      materialId,
      kind: "legacy-contextual-word-note",
      target: {
        type: "contextual-word-occurrence",
        occurrenceKey: "reading:missing-position",
        word: "orphan",
      },
      body: { format: "markdown", value: "orphan note" },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
    database.close();
  }, { timestamp });
  await expect.poll(async () => storedContextualNotes(page)).toHaveLength(1);

  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "empty-current-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 4,
      exportedAt: timestamp,
      materials: [],
      materialAssets: [],
      vocabulary: [],
      contextualWordNotes: [],
      settings: [],
    }), "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("備份已匯入");
  await expect.poll(async () => storedContextualNotes(page)).toHaveLength(0);
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: materialTitle })).toHaveCount(0);
});

test("imports a backup after removing a stale highlight target", async ({ page }) => {
  const timestamp = "2026-08-09T08:00:00.000Z";
  const materialId = "37f59d40-4f5f-4fc2-ac4d-515719319ba2";
  await page.goto("/");
  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("略過失效教材標記 1 筆");
    void dialog.accept();
  });
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "stale-highlight-v6.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 6,
      exportedAt: timestamp,
      materials: [{
        id: materialId,
        title: "保留教材並略過失效標記",
        description: "",
        content: "A bear runs.",
        contentBlocks: [{ type: "text", text: "A bear runs.", order: 0 }],
        knownWords: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      materialAssets: [],
      vocabulary: [],
      materialAnnotations: [{
        id: "df52b38d-02eb-4e99-a13e-320742f73803",
        materialId,
        kind: "highlight",
        target: {
          type: "reading-word-occurrences",
          paragraphKey: "stale-paragraph",
          occurrenceKeys: ["stale-occurrence"],
        },
        style: { color: "yellow" },
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      wordNotes: [],
      settings: [],
    }), "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("失效教材標記 1 筆");
  await expect.poll(() => storedHighlights(page)).toEqual([]);
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: "保留教材並略過失效標記" })).toBeVisible();
});

test("rolls back the complete replacement when a store clear fails", async ({ page }) => {
  await page.addInitScript(() => {
    const originalClear = IDBObjectStore.prototype.clear;
    IDBObjectStore.prototype.clear = function clear() {
      if (
        this.name === "vocabulary"
        && sessionStorage.getItem("failBackupReplacement") === "true"
      ) throw new DOMException("Simulated backup replacement failure", "UnknownError");
      return originalClear.call(this);
    };
  });
  await createMaterial(page);
  await page.evaluate(() => sessionStorage.setItem("failBackupReplacement", "true"));
  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "empty-current-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 6,
      exportedAt: "2026-08-12T08:00:00.000Z",
      materials: [],
      materialAssets: [],
      vocabulary: [],
      materialAnnotations: [],
      wordNotes: [],
      settings: [],
    }), "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("alert")).toContainText("備份匯入失敗");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
});

test("skips an unsupported image material and imports the remaining backup", async ({ page }) => {
  const timestamp = "2026-08-02T08:00:00.000Z";
  const supportedMaterialId = "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a27";
  const unsupportedMaterialId = "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a28";
  const supportedImageMaterialId = "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a29";
  await page.goto("/");
  await page.locator('button[aria-label="開啟資料管理"]').click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "mixed-support-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 3,
      materials: [
        {
          id: supportedMaterialId,
          title: "Supported text material",
          description: "",
          content: "A supported sentence.",
          contentBlocks: [{ type: "text", text: "A supported sentence.", order: 0 }],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: unsupportedMaterialId,
          title: "Unsupported image material",
          description: "",
          content: "An image sentence.",
          contentBlocks: [{ type: "image", assetId: "unsupported-asset", order: 0 }],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: supportedImageMaterialId,
          title: "Supported image material",
          description: "",
          content: "An image sentence.",
          contentBlocks: [{
            type: "image",
            assetId: "supported-asset",
            alt: "",
            caption: "",
            order: 0,
          }],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      materialAssets: [
        {
          id: "unsupported-asset",
          materialId: unsupportedMaterialId,
          mimeType: "image/webp",
          width: 1,
          height: 1,
          alt: "",
          caption: "",
          data: "data:image/webp;base64,not-a-webp",
        },
        {
          id: "supported-asset",
          materialId: supportedImageMaterialId,
          mimeType: "image/webp",
          width: 1,
          height: 1,
          alt: "",
          caption: "",
          data: `data:image/webp;base64,${validWebpBase64}`,
        },
      ],
      vocabulary: [],
      wordNotes: [],
      settings: [],
    }), "utf8"),
  });

  const dataDialog = page.locator('.data-management-dialog');
  await expect(dataDialog.locator('[role="status"]')).toContainText("略過不支援教材 1 份");
  await expect(page.getByText("Supported text material")).toBeVisible();
  await expect(page.getByText("Supported image material")).toBeVisible();
  await expect(page.getByText("Unsupported image material")).toHaveCount(0);
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  const supportedCard = page.getByRole("article").filter({ hasText: "Supported image material" });
  await supportedCard.getByRole("link", { name: "開始閱讀" }).click();
  const image = page.locator(".reading-figure img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => {
    const imageElement = element as HTMLImageElement;
    return [imageElement.complete, imageElement.naturalWidth, imageElement.naturalHeight];
  })).toEqual([true, 1, 1]);
});

test("skips a material whose reading position does not exist", async ({ page }) => {
  const timestamp = "2026-08-02T08:00:00.000Z";
  await createMaterial(page);
  await page.getByRole("button", { name: "開啟資料管理" }).click();

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "orphaned-reading-position.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 3,
      exportedAt: timestamp,
      materials: [{
        id: "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a27",
        title: "Invalid reading position",
        description: "",
        content: "Only one paragraph.",
        contentBlocks: [{ type: "text", text: "Only one paragraph.", order: 0 }],
        readingParagraphKey: "0-0-9",
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      vocabulary: [],
      wordNotes: [],
      settings: [],
    }), "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toBeVisible();
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: materialTitle })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Invalid reading position" })).toHaveCount(0);
});

test("clears a legacy reading marker that points to a newly classified heading", async ({ page }) => {
  const timestamp = "2026-08-02T08:00:00.000Z";
  await page.goto("/");
  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "legacy-heading-marker.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 3,
      exportedAt: timestamp,
      materials: [{
        id: "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a27",
        title: "Legacy heading marker",
        description: "",
        content: "Meet the Animals\nA lion sleeps.",
        contentBlocks: [
          { type: "text", text: "Meet the Animals", order: 0 },
          { type: "text", text: "A lion sleeps.", order: 1 },
        ],
        knownWords: [],
        readingParagraphKey: "0-0-0",
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      vocabulary: [],
      wordNotes: [],
      settings: [],
    }), "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("備份已匯入");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("article")
    .filter({ hasText: "Legacy heading marker" })
    .getByRole("link", { name: "開始閱讀" })
    .click();

  await expect(page.locator("[data-reading-paragraph]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "回到閱讀書籤" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "回到閱讀書籤" }))
    .toHaveAttribute("aria-pressed", "false");
});

test("imports a schema version 1 backup with legacy learning progress", async ({ page }) => {
  const timestamp = "2026-01-02T03:04:05.000Z";
  const legacyBackup = {
    schemaVersion: 1,
    materials: [{
      id: "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a27",
      title: "舊版備份教材",
      description: "",
      content: "Animal",
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    vocabulary: [{
      word: "animal",
      learned: true,
      learnedAt: timestamp,
      updatedAt: timestamp,
    }],
    wordNotes: [{
      word: "animal",
      markdown: "舊版全域筆記",
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
  };

  await page.goto("/");
  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "legacy-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacyBackup), "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("備份已匯入");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  const legacyCard = page.getByRole("article").filter({ hasText: "舊版備份教材" });
  await expect(legacyCard).toContainText("1 / 1");
  await legacyCard.getByRole("link", { name: "開始閱讀" }).click();
  await page.locator('[data-word="animal"]').first().focus();
  await expect(page.getByLabel("單字 Markdown 筆記")).toHaveText("舊版全域筆記");
});

test("imports a legacy package with its global word notes", async ({ page }) => {
  const timestamp = "2026-01-02T03:04:05.000Z";
  await page.goto("/");
  const downloadPromise = page.waitForEvent("download");
  await page.evaluate(async ({ timestamp }) => {
    const modulePath = "/src/core/backup/backup-package.ts";
    const { createBackupPackage } = await import(modulePath);
    const blob = await createBackupPackage({
      schemaVersion: 3,
      exportedAt: timestamp,
      materials: [{
        id: "8c16fdc9-f80e-47af-b77a-53046fe884ad",
        title: "舊版封裝教材",
        description: "",
        content: "Animal",
        contentBlocks: [{ type: "text", text: "Animal", order: 0 }],
        knownWords: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      materialAssets: [],
      vocabulary: [],
      wordNotes: [{
        word: "animal",
        markdown: "舊版封裝筆記",
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      settings: [],
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "legacy-backup.elpkg";
    link.click();
  }, { timestamp });
  const download = await downloadPromise;
  const backupPath = await download.path();
  if (!backupPath) throw new Error("legacy package was not downloaded");

  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles(backupPath);

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("備份已匯入");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  const legacyCard = page.getByRole("article").filter({ hasText: "舊版封裝教材" });
  await expect(legacyCard).toBeVisible();
  await legacyCard.getByRole("link", { name: "開始閱讀" }).click();
  await page.locator('[data-word="animal"]').first().focus();
  await expect(page.getByLabel("單字 Markdown 筆記")).toHaveText("舊版封裝筆記");
});
