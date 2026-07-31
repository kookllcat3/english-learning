import { expect, test, type Page } from "@playwright/test";

const materialTitle = "Playwright 動物短文";
const materialContent = "A bear runs. The bear sleeps.";

function alphabeticWord(index: number): string {
  let value = index;
  let word = "";
  do {
    word = String.fromCharCode(97 + (value % 26)) + word;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return `word${word}`;
}

async function createMaterial(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "新增素材" }).click();
  await page.getByLabel("素材名稱（選填）").fill(materialTitle);
  await page.getByLabel("直接貼上文字").fill(materialContent);
  await page.getByRole("button", { name: "儲存素材" }).click();
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
}

test("uses one Vue app and persists learning progress through routed views", async ({ page }) => {
  await createMaterial(page);

  await expect(page.locator("#app")).toHaveCount(1);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page).toHaveURL(/#\/materials\/.+/);
  await expect(page.getByRole("heading", { name: materialTitle, level: 1 })).toBeVisible();

  if ((page.viewportSize()?.width ?? 0) <= 720) {
    await page.getByRole("button", { name: "素材詞彙" }).click();
  }

  const bearCheckbox = page.getByRole("checkbox", { name: /bear/ });
  await bearCheckbox.check();
  await expect(page.getByText(/已認識\s+1\s+\/\s+5\s+個/)).toBeVisible();

  await page.reload();
  if ((page.viewportSize()?.width ?? 0) <= 720) {
    await page.getByRole("button", { name: "素材詞彙" }).click();
  }
  await expect(page.getByRole("checkbox", { name: /bear/ })).toBeChecked();
  await expect(page.getByText(/已認識\s+1\s+\/\s+5\s+個/)).toBeVisible();

  await page.getByRole("link", { name: "回到英文學習庫首頁" }).click();
  await expect(page).toHaveURL(/#\/?$/);
  const knownWordMetric = page.getByRole("article").filter({ hasText: "已認識詞彙" });
  await expect(knownWordMetric.getByRole("strong")).toHaveText("1");
});

test("formats and persists a Markdown word note", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();

  await page.locator('[data-word="bear"]').first().hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  const editor = page.getByLabel("單字 Markdown 筆記");
  await editor.click();
  await expect(page.getByRole("button", { name: "釘選單字卡" })).toHaveAttribute("aria-pressed", "false");
  await page.locator('[data-word="runs"]').first().hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  await editor.fill("large animal");
  await editor.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "粗體" }).click();
  await expect(editor.locator("b, strong")).toHaveText("large animal");
  await expect(page.getByRole("status")).toHaveText("已儲存");

  await page.reload();
  await page.locator('[data-word="bear"]').first().hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  await expect(page.getByLabel("單字 Markdown 筆記").locator("strong")).toHaveText("large animal");
});

test("pins the current word card until explicitly unpinned", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.locator('[data-word="bear"]').first().hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();

  await page.getByRole("button", { name: "釘選單字卡" }).click();
  await page.getByRole("heading", { name: materialTitle, level: 1 }).click();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();

  await page.locator('[data-word="runs"]').dblclick({ force: true });
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "取消釘選單字卡" }).click();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "關閉單字卡" }).click();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeHidden();
});

test("keeps an edited AI prompt when focus leaves the editor", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.getByRole("button", { name: "開啟 AI 輔助學習" }).click();

  const promptEditor = page.getByLabel("可編輯提示詞");
  await promptEditor.fill("我的自訂提示詞");
  await page.getByRole("heading", { name: "啟用 AI 學習" }).click();
  await expect(promptEditor).toHaveValue("我的自訂提示詞");
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("button", { name: "開啟 AI 輔助學習" }).click();
  await expect(page.getByLabel("可編輯提示詞")).toHaveValue("我的自訂提示詞");
});

test("keeps the legacy material URL compatible", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page).toHaveURL(/#\/materials\/.+/);
  const materialId = new URL(page.url()).hash.split("/").at(-1);

  await page.goto(`/material.html?id=${encodeURIComponent(materialId ?? "")}`);

  await expect(page).toHaveURL(new RegExp(`#\\/materials\\/${materialId}$`));
  await expect(page.getByRole("heading", { name: materialTitle, level: 1 })).toBeVisible();
});

test("exports, removes, and restores a complete backup", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
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

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("article")
    .filter({ hasText: materialTitle })
    .getByRole("button", { name: "移除" })
    .click();
  await expect(page.getByRole("heading", { name: materialTitle })).toHaveCount(0);

  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('input[type="file"][accept*="application/json"]')
    .setInputFiles(backupPath as string);

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("備份已匯入");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.getByRole("button", { name: "開啟 AI 輔助學習" }).click();
  await expect(page.getByLabel("可編輯提示詞")).toHaveValue("備份中的自訂 AI 提示詞");
});

test("reports an invalid backup without changing the library", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("button", { name: "開啟資料管理" }).click();

  await page.locator('input[type="file"][accept*="application/json"]').setInputFiles({
    name: "invalid-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from("{invalid json", "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("JSON");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
});

test("imports a schema version 1 backup with legacy learning progress", async ({ page }) => {
  const timestamp = "2026-01-02T03:04:05.000Z";
  const legacyBackup = {
    schemaVersion: 1,
    materials: [{
      id: "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a27",
      title: "舊版備份素材",
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
  await page.locator('input[type="file"][accept*="application/json"]').setInputFiles({
    name: "legacy-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacyBackup), "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("備份已匯入");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  const legacyCard = page.getByRole("article").filter({ hasText: "舊版備份素材" });
  await expect(legacyCard).toContainText("1 / 1");
});

test("keeps the viewport stable while sorting materials", async ({ page }) => {
  const timestamp = "2026-01-02T03:04:05.000Z";
  const titles = [
    "30隻動物",
    "Childish Gambino - This Is America",
    "blink-182 - ONE MORE TIME",
    "blink-182 - I Miss You",
  ];
  const materials = titles.map((title, index) => ({
    id: `7e4fafc8-9533-4a3e-bfb6-69fe4cc88a${String(index).padStart(2, "0")}`,
    title,
    description: "",
    content: `Material ${index + 1}`,
    createdAt: new Date(Date.parse(timestamp) + index * 1_000).toISOString(),
    updatedAt: new Date(Date.parse(timestamp) + index * 1_000).toISOString(),
  }));

  await page.goto("/");
  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('input[type="file"][accept*="application/json"]').setInputFiles({
    name: "sorting-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 1,
      materials,
      vocabulary: [],
    }), "utf8"),
  });
  await page.getByRole("button", { name: "關閉", exact: true }).click();

  const sortOptions = page.getByRole("group", { name: "素材排序方式" });
  if ((page.viewportSize()?.width ?? 0) > 720) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  } else {
    await sortOptions.evaluate((element) => element.scrollIntoView({ block: "center" }));
  }
  const scrollPositionBeforeSorting = await page.evaluate(() => window.scrollY);

  await page.getByRole("radio", { name: "名稱" }).click();
  await expect(page.locator(".material-grid")).toHaveAttribute("aria-busy", "false");

  const scrollPositionAfterSorting = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollPositionAfterSorting - scrollPositionBeforeSorting)).toBeLessThanOrEqual(1);

  const shortTitleCard = page.getByRole("article").filter({ hasText: "30隻動物" });
  const cardHeightsBeforeProgressSort = await page.locator(".material-card").evaluateAll(
    (elements) => elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(new Set(cardHeightsBeforeProgressSort).size).toBe(1);
  const cardHeightBeforeProgressSort = await shortTitleCard.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await page.getByRole("radio", { name: "完成度" }).click();
  await expect(page.locator(".material-grid")).toHaveAttribute("aria-busy", "false");
  const cardHeightAfterProgressSort = await shortTitleCard.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  const cardHeightsAfterProgressSort = await page.locator(".material-card").evaluateAll(
    (elements) => elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(new Set(cardHeightsAfterProgressSort).size).toBe(1);
  expect(cardHeightAfterProgressSort).toBe(cardHeightBeforeProgressSort);
});

test("bounds the rendered vocabulary list for large materials", async ({ page }) => {
  const words = Array.from({ length: 350 }, (_, index) => alphabeticWord(index));
  await page.goto("/");
  await page.getByRole("button", { name: "新增素材" }).click();
  await page.getByLabel("素材名稱（選填）").fill("大型詞彙列表");
  await page.getByLabel("直接貼上文字").fill(words.join(" "));
  await page.getByRole("button", { name: "儲存素材" }).click();
  await page.getByRole("link", { name: "開始閱讀" }).click();

  if ((page.viewportSize()?.width ?? 0) <= 720) {
    await page.getByRole("button", { name: "素材詞彙" }).click();
  }

  await expect(page.getByRole("checkbox")).toHaveCount(300);
  await page.getByRole("button", { name: /顯示更多/ }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(350);
});
