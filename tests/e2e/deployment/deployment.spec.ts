import { expect, test } from "@playwright/test";

test("serves the built app and supports direct hash-route entry", async ({ page }) => {
  const response = await page.goto("/index.html#/materials/missing-material");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "找不到這份素材", level: 1 })).toBeVisible();
  await expect(page.locator("#app")).toHaveCount(1);
});

test("keeps the built legacy material entry compatible", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新增素材" }).click();
  await page.getByLabel("素材名稱（選填）").fill("正式建置轉址素材");
  await page.getByLabel("直接貼上文字").fill("Production route.");
  await page.getByRole("button", { name: "儲存素材" }).click();
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page).toHaveURL(/#\/materials\/.+/);
  await expect(page.getByRole("heading", { name: "正式建置轉址素材", level: 1 })).toBeVisible();
  const materialId = new URL(page.url()).hash.split("/").at(-1);

  const response = await page.goto(`/material.html?id=${encodeURIComponent(materialId ?? "")}`);

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`#\\/materials\\/${materialId}$`));
  await expect(page.getByRole("heading", { name: "正式建置轉址素材", level: 1 })).toBeVisible();
});
