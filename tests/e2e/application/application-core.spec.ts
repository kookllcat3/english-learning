import { expect, test } from "@playwright/test";

import {
  createMaterial,
  materialTitle,
  seedKnownWordsForCurrentMaterial,
} from "./test-helpers";

test("uses one Vue app and keeps reading as the only material view", async ({ page }) => {
  await createMaterial(page);

  await expect(page.locator("#app")).toHaveCount(1);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page).toHaveURL(/#\/materials\/.+/);
  await expect(page.getByRole("heading", { name: materialTitle, level: 1 })).toBeVisible();

  await expect(page.locator(".material-view-switcher")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "教材詞彙" })).toHaveCount(0);
  await expect(page.locator(".vocabulary-panel")).toHaveCount(0);

  await seedKnownWordsForCurrentMaterial(page, ["bear"]);
  await page.reload();
  await expect(page.locator('[data-word="bear"]').first()).toHaveClass(/known-word/);

  await page.getByRole("link", { name: "回到英文學習庫首頁" }).click();
  await expect(page).toHaveURL(/#\/?$/);
  const knownWordMetric = page.getByRole("article").filter({ hasText: "已認識單字" });
  await expect(knownWordMetric.getByRole("strong")).toHaveText("1");
});

test("shows global familiarity in an unread material", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const learnedMaterialTitle = "Familiarity source";
  const unreadMaterialTitle = "Unread material";
  await createMaterial(page, learnedMaterialTitle, "A bear sleeps.");

  const learnedMaterialCard = page.getByRole("article").filter({ hasText: learnedMaterialTitle });
  await learnedMaterialCard.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page).toHaveURL(/#\/materials\/.+/);
  await seedKnownWordsForCurrentMaterial(page, ["bear"]);
  await page.reload();
  await expect(page.locator('[data-word="bear"]').first()).toHaveClass(/known-word/);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction("settings", "readwrite");
    transaction.objectStore("settings").put({
      key: "familiarityColor",
      value: "#ff00ff",
      updatedAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
    database.close();
  });

  await createMaterial(page, unreadMaterialTitle, "The bear wakes.");
  const unreadMaterialCard = page.getByRole("article").filter({ hasText: unreadMaterialTitle });
  await unreadMaterialCard.getByRole("link", { name: "開始閱讀" }).click();

  const unreadBear = page.locator('[data-word="bear"]').first();
  await expect(unreadBear).toHaveClass(/known-word/);
  await expect(unreadBear.locator(".known-word__glyph")).toHaveCount(4);
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  await expect(page.locator(".familiarity-legend")).toHaveCount(0);
  await expect(page.getByText("熟悉度標記", { exact: true })).toHaveCount(0);
  const familiarityTokens = await unreadBear.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      base: style.getPropertyValue("--familiarity-color").trim(),
      glow: style.getPropertyValue("--familiarity-glow").trim(),
    };
  });
  expect(familiarityTokens).toEqual({ base: "63 75 120", glow: "233 190 99" });
  for (const highlightColor of ["#fff2a8", "#dff2c2", "#f8d7df", "#dce9ff"]) {
    const textShadow = await unreadBear.locator(".known-word__glyph").first().evaluate(
      (element, backgroundColor) => {
        const word = element.closest<HTMLElement>(".known-word");
        if (word) word.style.backgroundColor = backgroundColor;
        return getComputedStyle(element).textShadow;
      },
      highlightColor,
    );
    expect(textShadow).not.toBe("none");
  }
  const storedLegacyColor = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const request = database.transaction("settings", "readonly")
      .objectStore("settings").get("familiarityColor");
    const result = await new Promise<{ value?: unknown } | undefined>((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    database.close();
    return result?.value;
  });
  expect(storedLegacyColor).toBe("#ff00ff");
});
