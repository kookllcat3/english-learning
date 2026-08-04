import { expect, test } from "@playwright/test";

import { createMaterial, materialTitle, validWebpBase64 } from "./test-helpers";

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
  await page.getByRole("button", { name: "標記目前閱讀段落" }).first().click();
  await page.getByRole("button", { name: "開啟 AI 輔助學習" }).click();
  await page.getByLabel("可編輯提示詞").fill("備份中的自訂 AI 提示詞");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("link", { name: "回到英文學習庫首頁" }).click();

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

  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]')
    .setInputFiles(backupPath as string);

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("備份已匯入");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.getByRole("button", { name: "回到閱讀位置" })).toBeVisible();
  await expect(page.getByRole("button", { name: "標記目前閱讀段落" }).first())
    .toHaveAttribute("aria-pressed", "true");
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
  await expect(page.getByRole("button", { name: "回到閱讀位置" })).toBeHidden();
  await expect(page.getByRole("button", { name: "標記目前閱讀段落" }))
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
});
