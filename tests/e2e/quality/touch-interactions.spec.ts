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
