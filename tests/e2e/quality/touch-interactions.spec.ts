import { expect, test } from "@playwright/test";
import {
  storedCurrentMaterialKnownWords,
  storedHighlights,
} from "../application/test-helpers";

const anchorOptionName = "將閱讀書籤設在此段";

async function createTouchMaterial(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "新增教材" }).click();
  await page.locator('input[name="title"]').fill("Touch interactions");
  await page.locator('textarea[name="content"]').fill("An original sentence.\n中文翻譯內容。");
  await page.getByRole("button", { name: "儲存教材" }).click();
  const materialCard = page.getByRole("article").filter({ hasText: "Touch interactions" });
  await materialCard.getByRole("link", { name: "開始閱讀" }).click();
}

test("toggles a fixed translation blur control with touch", async ({ page }) => {
  await createTouchMaterial(page);

  const translationLine = page.locator(".reading-line-wrap.is-translation").first();
  const translationText = translationLine.locator(".reading-line");
  const toggle = page.getByRole("button", { name: "隱藏全部中文翻譯" });

  await expect(toggle).toHaveCSS("pointer-events", "auto");
  await toggle.tap();
  await expect(translationText).toHaveClass(/translation-mask/);
});

test("marks paragraph words through the reading position control with touch", async ({ page }) => {
  await createTouchMaterial(page);

  const marker = page.getByRole("button", { name: "設定閱讀書籤" });
  await marker.tap();
  const paragraph = page.locator("[data-reading-paragraph]").first();
  await paragraph.getByRole("button", { name: anchorOptionName }).tap();

  const readingAnchor = paragraph.locator(".reading-anchor__button.is-selected");
  await expect(readingAnchor).toBeVisible();
  await expect.poll(() => storedCurrentMaterialKnownWords(page))
    .toEqual(["an", "original", "sentence"]);
  await expect(page.getByRole("button", { name: "本篇單字已全部認識" })).toBeDisabled();
  await readingAnchor.tap();
  await expect(readingAnchor).toHaveCount(0);
});

test("switches a reading bookmark with touch gutter buttons", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新增教材" }).click();
  await page.locator('input[name="title"]').fill("Touch bookmark switching");
  await page.locator('textarea[name="content"]').fill(
    "First touch paragraph.\n第一段翻譯。\n\nSecond touch paragraph.\n第二段翻譯。",
  );
  await page.getByRole("button", { name: "儲存教材" }).click();
  await page.getByRole("article").filter({ hasText: "Touch bookmark switching" })
    .getByRole("link", { name: "開始閱讀" }).click();

  const paragraphs = page.locator("[data-reading-paragraph]");
  await page.getByRole("button", { name: "設定閱讀書籤" }).tap();
  await expect(page.getByRole("button", { name: anchorOptionName })).toHaveCount(2);
  await paragraphs.nth(0).getByRole("button", { name: anchorOptionName }).tap();
  await expect(paragraphs.nth(0).locator(".reading-anchor__button.is-selected")).toBeVisible();
  await paragraphs.nth(1).getByRole("button", { name: anchorOptionName }).tap();
  await expect(paragraphs.nth(0).locator(".reading-anchor__button.is-selected")).toHaveCount(0);
  await expect(paragraphs.nth(1).locator(".reading-anchor__button.is-selected")).toBeVisible();
});

test("adds and removes a highlight without opening the word card on touch", async ({ page }) => {
  await createTouchMaterial(page);
  const paragraph = page.locator("[data-reading-paragraph]").first();
  const entry = page.getByRole("button", { name: "螢光筆" });
  await entry.tap();
  await expect(paragraph.getByRole("group", { name: "選擇標記工具" })).toHaveCount(0);

  await entry.tap();
  await expect(entry).toHaveAttribute("aria-pressed", "false");

  await entry.tap();
  await page.locator(".material-heading").tap({ position: { x: 2, y: 2 } });
  await expect(entry).toHaveAttribute("aria-pressed", "false");

  await entry.tap();
  const word = paragraph.locator('[data-word="original"]');
  await word.tap();
  await expect(word).toHaveClass(/is-highlighted/);
  await expect(page.locator(".word-card")).toBeHidden();
  await expect.poll(() => storedHighlights(page)).toHaveLength(1);

  await word.tap();
  await expect(word).not.toHaveClass(/is-highlighted/);
  await expect.poll(() => storedHighlights(page)).toEqual([]);
  await expect(entry).toHaveAttribute("aria-pressed", "true");

  await paragraph.locator(".reading-line-wrap.is-translation").tap();
  await expect(entry).toHaveAttribute("aria-pressed", "false");
});

test("prevents background touch scrolling while the word card is open", async ({ page }) => {
  await createTouchMaterial(page);
  await page.getByRole("button", { name: "設定閱讀書籤" }).tap();
  await page.locator("[data-reading-paragraph]").first()
    .getByRole("button", { name: anchorOptionName }).tap();
  await page.locator(".material-heading").tap({ position: { x: 2, y: 2 } });
  await page.evaluate(() => { document.body.style.minHeight = "2000px"; });
  await page.locator('[data-word="original"]').first().tap();
  await expect(page.locator(".word-card")).toBeVisible();
  await expect(page.getByRole("heading", { name: "original", level: 2 }))
    .toHaveClass(/known-word/);
  await expect(page.locator("#word-card-title .known-word__glyph")).toHaveCount(8);
  await expect(page.locator(".word-card-backdrop")).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).position)).toBe("fixed");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehavior)).toBe("none");
});

test("locks the page behind a native dialog on touch devices", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".material-grid")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(() => {
    document.body.style.minHeight = "2000px";
  });
  await expect.poll(() => page.evaluate(() => {
    window.scrollTo(0, 400);
    return window.scrollY;
  })).toBe(400);
  await page.getByRole("button", { name: "開啟資料管理" }).click();

  await expect(page.getByRole("dialog", { name: "資料管理" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("fixed");
  await expect.poll(() => page.evaluate(() => document.body.style.top)).toBe("-400px");

  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
});

test("allows a current backup package to be chosen on mobile", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "開啟資料管理" }).click();
  const backupInput = page.locator('.data-management-dialog input[type="file"]');
  await expect(backupInput).toHaveAttribute("accept", ".elpkg,.json");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下載備份" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  if (!backupPath) throw new Error("backup package was not downloaded");

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "選擇備份" }).click();
  const fileChooser = await fileChooserPromise;
  page.once("dialog", (dialog) => dialog.accept());
  await fileChooser.setFiles(backupPath);

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("備份已匯入");
});

test("keeps primary reading actions operable on a tablet viewport", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await createTouchMaterial(page);

  const marker = page.getByRole("button", { name: "設定閱讀書籤" });
  await marker.tap();
  const paragraph = page.locator("[data-reading-paragraph]").first();
  await paragraph.getByRole("button", { name: anchorOptionName }).tap();
  await expect(paragraph.locator(".reading-anchor__button.is-selected")).toBeVisible();
  await expect.poll(() => storedCurrentMaterialKnownWords(page))
    .toEqual(["an", "original", "sentence"]);

  await page.getByRole("button", { name: "開啟資料管理" }).tap();
  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog).toBeVisible();
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true);
});
