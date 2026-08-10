import { expect, test } from "@playwright/test";
import packageMetadata from "../../../package.json" with { type: "json" };

test("persists separate editable text and illustrated material prompts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "查看教材製作教學" }).click();

  const guideDialog = page.getByRole("dialog", { name: "如何製作學習教材" });
  await expect(guideDialog.getByRole("status")).toHaveText(`v${packageMetadata.version}`);
  const textPrompt = guideDialog.getByLabel("純文字教材生成提示詞");
  await expect(textPrompt).toHaveValue(/專業的英語教材編輯/);
  await textPrompt.fill("自訂純文字教材提示詞");

  await guideDialog.getByRole("tab", { name: "圖文" }).click();
  const docxPrompt = guideDialog.getByLabel("圖文教材生成提示詞");
  await expect(docxPrompt).toHaveValue(/圖文文件設計師/);
  await docxPrompt.fill("自訂圖文教材提示詞");
  await expect(guideDialog.getByRole("status")).toContainText("圖文提示詞已儲存");

  await guideDialog.getByRole("tab", { name: "純文字" }).click();
  await guideDialog.getByLabel("純文字教材生成提示詞").fill("關閉前立即儲存的純文字提示詞");
  await guideDialog.getByRole("button", { name: "關閉" }).click();
  await page.getByRole("button", { name: "查看教材製作教學" }).click();
  await expect(guideDialog.getByLabel("純文字教材生成提示詞"))
    .toHaveValue("關閉前立即儲存的純文字提示詞");

  await page.reload();
  await page.getByRole("button", { name: "查看教材製作教學" }).click();

  await expect(guideDialog.getByLabel("純文字教材生成提示詞"))
    .toHaveValue("關閉前立即儲存的純文字提示詞");
  await guideDialog.getByRole("tab", { name: "圖文" }).click();
  await expect(guideDialog.getByLabel("圖文教材生成提示詞"))
    .toHaveValue("自訂圖文教材提示詞");
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
