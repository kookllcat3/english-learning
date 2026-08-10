import fs from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import {
  createMaterial,
  seedKnownWordsForCurrentMaterial,
  validWebpBase64,
} from "./test-helpers";

interface StoredMaterialSnapshot {
  assets: number;
  content: string;
  createdAt: string;
  id: string;
  knownWords: string[];
  readingParagraphKey: string | null;
  updatedAt: string;
  wordCount: number;
  wordNote?: string;
  foxLearned?: boolean;
}

async function storedMaterial(page: Page, title: string): Promise<StoredMaterialSnapshot> {
  return page.evaluate(async (materialTitle) => new Promise((resolve, reject) => {
    const request = indexedDB.open("english-learning");
    request.addEventListener("success", () => {
      const database = request.result;
      const transaction = database.transaction(
        ["materials", "materialContents", "materialAssets", "vocabulary", "wordNotes"],
        "readonly",
      );
      const materialRequest = transaction.objectStore("materials").getAll();
      materialRequest.addEventListener("success", () => {
        const material = materialRequest.result.find((record) => record.title === materialTitle);
        if (!material) {
          transaction.abort();
          reject(new Error("Stored material was not found."));
          return;
        }
        const contentRequest = transaction.objectStore("materialContents").get(material.id);
        const assetsRequest = transaction.objectStore("materialAssets").index("materialId").count(material.id);
        const vocabularyRequest = transaction.objectStore("vocabulary").get("fox");
        const noteRequest = transaction.objectStore("wordNotes").get("bear");
        transaction.addEventListener("complete", () => {
          resolve({
            assets: assetsRequest.result,
            content: contentRequest.result?.content ?? "",
            createdAt: material.createdAt,
            id: material.id,
            knownWords: material.knownWords,
            readingParagraphKey: material.readingParagraphKey ?? null,
            updatedAt: material.updatedAt,
            wordCount: material.wordCount,
            wordNote: noteRequest.result?.markdown,
            foxLearned: vocabularyRequest.result?.learned,
          });
          database.close();
        }, { once: true });
      }, { once: true });
      transaction.addEventListener("abort", () => {
        database.close();
        reject(transaction.error ?? new Error("Stored material read was aborted."));
      }, { once: true });
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  }), title);
}

async function seedSharedNote(page: Page): Promise<void> {
  await page.evaluate(async () => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("english-learning");
    request.addEventListener("success", () => {
      const database = request.result;
      const transaction = database.transaction("wordNotes", "readwrite");
      const timestamp = new Date().toISOString();
      transaction.objectStore("wordNotes").put({
        word: "bear",
        markdown: "shared bear note",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.addEventListener("complete", () => {
        database.close();
        resolve();
      }, { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  }));
}

async function chooseReplacementFile(
  page: Page,
  buttonName: RegExp,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: buttonName }).click();
  const chooser = await chooserPromise;
  page.once("dialog", (dialog) => dialog.accept());
  await chooser.setFiles(file);
}

test("exports and updates the same text material while preserving compatible learning data", async ({ page }) => {
  const title = "可更新文字教材";
  const originalContent = "Bear fox.\n\n熊與狐狸。";
  await createMaterial(page, title, originalContent);
  const card = page.getByRole("article").filter({ hasText: title });
  const actions = card.locator(".material-card__actions").locator("a, button");
  await expect(actions).toHaveCount(4);
  await expect(actions.nth(0)).toHaveAttribute("aria-label", "開始閱讀");
  await expect(actions.nth(1)).toHaveAttribute("aria-label", `匯出目前教材 ${title}`);
  await expect(actions.nth(2)).toHaveAttribute("aria-label", `重新匯入並更新教材 ${title}`);
  await expect(actions.nth(3)).toHaveAttribute("aria-label", `移除教材 ${title}`);

  await card.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page).toHaveURL(/#\/materials\//);
  await seedKnownWordsForCurrentMaterial(page, ["bear", "fox"]);
  await seedSharedNote(page);
  await page.locator("[data-reading-paragraph]").first()
    .getByRole("button", { name: "將閱讀書籤設在此段" })
    .click();
  await page.goto("/");
  const before = await storedMaterial(page, title);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: new RegExp(`匯出目前教材 ${title}`) }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${title}.txt`);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Text material export was not downloaded.");
  await expect(fs.readFile(downloadPath, "utf8")).resolves.toBe(originalContent);

  await chooseReplacementFile(
    page,
    new RegExp(`重新匯入並更新教材 ${title}`),
    {
      name: "replacement.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Bear owl.\n\n熊與貓頭鷹。", "utf8"),
    },
  );
  const updatedCard = page.getByRole("article").filter({ hasText: title });
  await expect(updatedCard.locator(".material-card__progress")).toContainText("1 / 2");

  const after = await storedMaterial(page, title);
  expect(after.id).toBe(before.id);
  expect(after.createdAt).toBe(before.createdAt);
  expect(after.updatedAt).not.toBe(before.updatedAt);
  expect(after.content).toBe("Bear owl.\n\n熊與貓頭鷹。");
  expect(after.knownWords).toEqual(["bear"]);
  expect(after.wordCount).toBe(2);
  expect(after.readingParagraphKey).toBeNull();
  expect(after.wordNote).toBe("shared bear note");
  expect(after.foxLearned).toBe(false);
});

test("exports an illustrated material as DOCX and imports it back with its image order", async ({ page }) => {
  const title = "圖文往返教材";
  await page.goto("/");
  await expect(page.locator(".material-grid")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(async ({ materialTitle, webpBase64 }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("english-learning");
    request.addEventListener("success", () => {
      const database = request.result;
      const transaction = database.transaction(
        ["materials", "materialContents", "materialTerms", "materialAssets"],
        "readwrite",
      );
      const timestamp = new Date().toISOString();
      const materialId = crypto.randomUUID();
      const assetId = crypto.randomUUID();
      const imageBytes = Uint8Array.from(atob(webpBase64), (character) => character.charCodeAt(0));
      transaction.objectStore("materials").put({
        id: materialId,
        title: materialTitle,
        description: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        wordCount: 3,
        knownCount: 0,
        knownWords: [],
      });
      transaction.objectStore("materialContents").put({
        materialId,
        content: "A bear sees.\n\n圖片後文字。",
        contentBlocks: [
          { type: "text", text: "A bear sees.", order: 0 },
          { type: "image", assetId, alt: "測試圖片", caption: "圖片說明", order: 1 },
          { type: "text", text: "圖片後文字。", order: 2 },
        ],
      });
      transaction.objectStore("materialTerms").put({ materialId, words: ["a", "bear", "sees"] });
      transaction.objectStore("materialAssets").put({
        id: assetId,
        materialId,
        blob: imageBytes.buffer,
        mimeType: "image/webp",
        width: 1,
        height: 1,
        alt: "測試圖片",
        caption: "圖片說明",
      });
      transaction.addEventListener("complete", () => {
        database.close();
        resolve();
      }, { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  }), { materialTitle: title, webpBase64: validWebpBase64 });
  await page.reload();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: new RegExp(`匯出目前教材 ${title}`) }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${title}.docx`);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Illustrated material export was not downloaded.");

  await chooseReplacementFile(
    page,
    new RegExp(`重新匯入並更新教材 ${title}`),
    { name: `${title}.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await fs.readFile(downloadPath) },
  );
  await expect(page.getByRole("button", { name: new RegExp(`重新匯入並更新教材 ${title}`) }))
    .toHaveAttribute("aria-busy", "false");
  const snapshot = await storedMaterial(page, title);
  expect(snapshot.assets).toBe(1);

  await page.getByRole("article").filter({ hasText: title }).getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.getByRole("img", { name: "測試圖片" })).toBeVisible();
  await expect(page.getByText("圖片說明")).toBeVisible();
  const visibleOrder = await page.locator(
    ".reading-content > .reading-paragraph, .reading-content > .reading-figure",
  ).evaluateAll((elements) => (
    elements.map((element) => element.tagName.toLocaleLowerCase())
  ));
  expect(visibleOrder).toEqual(["div", "figure", "div"]);
});

test("rolls back every store when the replacement transaction fails", async ({ page }) => {
  const title = "交易回滾教材";
  await createMaterial(page, title, "Bear fox.");
  const before = await storedMaterial(page, title);
  const dialogMessages: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogMessages.push(dialog.message());
    await dialog.accept();
  });
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    Object.defineProperty(globalThis, "restoreMaterialPut", {
      configurable: true,
      value: () => {
        IDBObjectStore.prototype.put = originalPut;
        delete (globalThis as typeof globalThis & { restoreMaterialPut?: () => void }).restoreMaterialPut;
      },
    });
    IDBObjectStore.prototype.put = function put(value: unknown, key?: IDBValidKey) {
      if (this.name === "materialContents") throw new DOMException("Simulated write failure", "QuotaExceededError");
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
    };
  });

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: new RegExp(`重新匯入並更新教材 ${title}`) }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "failed-update.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Bear owl.", "utf8"),
  });
  await expect.poll(() => dialogMessages.some((message) => message.includes("教材更新失敗"))).toBe(true);
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { restoreMaterialPut?: () => void }).restoreMaterialPut?.();
  });

  const after = await storedMaterial(page, title);
  expect(after).toEqual(before);
});

test("refuses to overwrite a material changed after the card was loaded", async ({ page }) => {
  const title = "跨分頁衝突教材";
  await createMaterial(page, title, "Bear fox.");
  const before = await storedMaterial(page, title);
  const externalUpdatedAt = "2099-08-08T12:00:00.000Z";
  await page.evaluate(async ({ materialId, updatedAt }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("english-learning");
    request.addEventListener("success", () => {
      const database = request.result;
      const transaction = database.transaction("materials", "readwrite");
      const store = transaction.objectStore("materials");
      const materialRequest = store.get(materialId);
      materialRequest.addEventListener("success", () => {
        store.put({ ...materialRequest.result, updatedAt });
      }, { once: true });
      transaction.addEventListener("complete", () => {
        database.close();
        resolve();
      }, { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  }), { materialId: before.id, updatedAt: externalUpdatedAt });

  const dialogMessages: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogMessages.push(dialog.message());
    await dialog.accept();
  });
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: new RegExp(`重新匯入並更新教材 ${title}`) }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "stale-update.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Bear owl.", "utf8"),
  });
  await expect.poll(() => dialogMessages.some((message) => message.includes("其他分頁更新"))).toBe(true);

  const after = await storedMaterial(page, title);
  expect(after.content).toBe(before.content);
  expect(after.updatedAt).toBe(externalUpdatedAt);
  expect(after.knownWords).toEqual(before.knownWords);
});
