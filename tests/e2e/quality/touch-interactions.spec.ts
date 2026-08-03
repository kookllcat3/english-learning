import { expect, test } from "@playwright/test";

async function createTouchMaterial(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "新增素材" }).click();
  await page.locator('input[name="title"]').fill("Touch interactions");
  await page.locator('textarea[name="content"]').fill("An original sentence.\n中文翻譯內容。");
  await page.getByRole("button", { name: "儲存素材" }).click();
  const materialCard = page.getByRole("article").filter({ hasText: "Touch interactions" });
  await materialCard.getByRole("link", { name: "開始閱讀" }).click();
}

test("toggles a fixed translation blur control with touch", async ({ page }) => {
  await createTouchMaterial(page);

  const translationLine = page.locator(".reading-line-wrap.is-translation").first();
  const translationText = translationLine.locator(".reading-line");
  const toggle = translationLine.locator(".translation-visibility-toggle");

  await expect(toggle).toHaveCSS("pointer-events", "auto");
  await toggle.tap();
  await expect(translationText).toHaveClass(/translation-mask/);
});

test("prevents background touch scrolling while the word card is open", async ({ page }) => {
  await createTouchMaterial(page);
  await page.evaluate(() => { document.body.style.minHeight = "2000px"; });
  await page.locator('[data-word="original"]').first().tap();
  await expect(page.locator(".word-card")).toBeVisible();
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
  await expect(backupInput).not.toHaveAttribute("accept", /.+/);

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
