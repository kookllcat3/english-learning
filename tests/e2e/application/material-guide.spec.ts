import { expect, test } from "@playwright/test";

test("keeps the app version visible in the material guide heading on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto("/");
  await page.getByRole("button", { name: "查看教材製作教學" }).click();

  const guideDialog = page.getByRole("dialog", { name: "如何製作學習教材" });
  const heading = guideDialog.locator(".dialog__heading");
  const version = heading.locator(".material-guide-dialog__version");
  await expect(version).toHaveText(/^v\d+\.\d+\.\d+$/);
  await expect(version).toBeVisible();
  await expect(guideDialog.locator(".dialog__content .material-guide-dialog__version")).toHaveCount(0);
});

test("reports a material prompt persistence failure without replacing the default", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "查看教材製作教學" }).click();

  const guideDialog = page.getByRole("dialog", { name: "如何製作學習教材" });
  const textPrompt = guideDialog.getByLabel("純文字教材生成提示詞");
  await expect(textPrompt).toHaveValue(/專業的英語教材編輯/);
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(value, key) {
      if (this.name === "settings") {
        throw new DOMException("Synthetic settings failure", "QuotaExceededError");
      }
      return originalPut.call(this, value, key);
    };
  });

  await textPrompt.fill("不應寫入資料庫的提示詞");
  await expect(guideDialog.getByRole("status")).toContainText("提示詞儲存失敗");
  await page.reload();
  await page.getByRole("button", { name: "查看教材製作教學" }).click();
  await expect(guideDialog.getByLabel("純文字教材生成提示詞"))
    .toHaveValue(/專業的英語教材編輯/);
});
