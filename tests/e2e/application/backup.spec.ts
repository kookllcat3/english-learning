import { expect, test } from "@playwright/test";

import {
  createMaterial,
  materialTitle,
  storedContextualNotes,
  storedHighlights,
  storedSettingValue,
  storedWordNotes,
  validWebpBase64,
} from "./test-helpers";

test("exports, removes, and restores a complete backup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "查看教材製作教學" }).click();
  const guideDialog = page.getByRole("dialog", { name: "如何製作學習教材" });
  await guideDialog.getByLabel("純文字教材生成提示詞").fill("備份中的純文字教材提示詞");
  await guideDialog.getByRole("tab", { name: "圖文" }).click();
  await guideDialog.getByLabel("圖文教材生成提示詞").fill("備份中的圖文教材提示詞");
  await expect(guideDialog.getByRole("status")).toContainText("圖文提示詞已儲存");
  await guideDialog.getByRole("button", { name: "關閉" }).click();

  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  const firstParagraph = page.locator("[data-reading-paragraph]").first();
  await page.getByRole("button", { name: "設定閱讀錨點" }).click();
  await firstParagraph.locator(".reading-word").first().click();
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
    settings.delete("materialGuideDocxPrompt");
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
  await expect(page.getByRole("button", { name: "回到閱讀錨點" })).toBeVisible();
  await expect(page.getByRole("button", { name: "管理本段閱讀錨點" })).toBeVisible();
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
  await guideDialog.getByRole("tab", { name: "圖文" }).click();
  await expect(guideDialog.getByLabel("圖文教材生成提示詞"))
    .toHaveValue("備份中的圖文教材提示詞");
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

test("removes orphaned legacy contextual annotations while merging a backup", async ({ page }) => {
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
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "回到閱讀錨點" })).toBeHidden();
  await expect(page.getByRole("button", { name: "設定閱讀錨點" }))
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
