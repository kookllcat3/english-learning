import { expect, test } from "@playwright/test";

import { createMaterial } from "./test-helpers";

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
