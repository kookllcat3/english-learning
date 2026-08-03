import { expect, test } from "@playwright/test";

import { createMaterial, materialTitle } from "./test-helpers";

test("uses one Vue app and persists learning progress through routed views", async ({ page }) => {
  await createMaterial(page);

  await expect(page.locator("#app")).toHaveCount(1);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page).toHaveURL(/#\/materials\/.+/);
  await expect(page.getByRole("heading", { name: materialTitle, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "教材詞彙" }).click();

  const bearCheckbox = page.getByRole("checkbox", { name: /bear/ });
  await bearCheckbox.check();
  await expect(page.getByText(/已認識\s+1\s+\/\s+5\s+個/)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "教材詞彙" }).click();
  await expect(page.getByRole("checkbox", { name: /bear/ })).toBeChecked();
  await expect(page.getByText(/已認識\s+1\s+\/\s+5\s+個/)).toBeVisible();

  await page.getByRole("link", { name: "回到英文學習庫首頁" }).click();
  await expect(page).toHaveURL(/#\/?$/);
  const knownWordMetric = page.getByRole("article").filter({ hasText: "已認識詞彙" });
  await expect(knownWordMetric.getByRole("strong")).toHaveText("1");
});

test("shows global familiarity in an unread material", async ({ page }) => {
  const learnedMaterialTitle = "Familiarity source";
  const unreadMaterialTitle = "Unread material";
  await createMaterial(page, learnedMaterialTitle, "A bear sleeps.");

  const learnedMaterialCard = page.getByRole("article").filter({ hasText: learnedMaterialTitle });
  await learnedMaterialCard.getByRole("link", { name: "開始閱讀" }).click();
  await page.getByRole("button", { name: "教材詞彙" }).click();
  await page.getByRole("checkbox", { name: /bear/ }).check();
  await expect(page.locator('[data-word="bear"]').first()).toHaveClass(/known-word/);

  await createMaterial(page, unreadMaterialTitle, "The bear wakes.");
  const unreadMaterialCard = page.getByRole("article").filter({ hasText: unreadMaterialTitle });
  await unreadMaterialCard.getByRole("link", { name: "開始閱讀" }).click();

  const unreadBear = page.locator('[data-word="bear"]').first();
  await expect(unreadBear).toHaveClass(/known-word/);
  await expect(unreadBear.locator(".known-word__glyph")).toHaveCount(4);
});
