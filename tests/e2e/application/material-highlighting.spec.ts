import { expect, test } from "@playwright/test";

import { createMaterial, storedHighlights } from "./test-helpers";

test("creates jumping highlights, connects adjacent words, persists, and erases precisely", async ({ page }) => {
  await createMaterial(page, "螢光標記測試", "A bear runs quickly.\n中文翻譯。\n\nThe fox sleeps.");
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const paragraphs = page.locator("[data-reading-paragraph]");
  const firstParagraph = paragraphs.first();
  const highlighterEntry = firstParagraph.getByRole("button", { name: "開啟螢光筆工具" });
  await highlighterEntry.click();
  const toolMenu = firstParagraph.getByRole("group", { name: "選擇標記工具" });
  await expect(toolMenu).toBeVisible();
  expect(await toolMenu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth;
  })).toBe(true);
  await firstParagraph.getByRole("button", { name: "淡黃色螢光筆" }).click();
  await expect(highlighterEntry).toHaveAttribute("aria-pressed", "true");

  const words = firstParagraph.locator(".reading-word");
  await words.nth(0).click();
  await expect(words.nth(0)).toHaveClass(/is-highlighted/);
  await expect(highlighterEntry).toBeEnabled();
  await words.nth(2).click();
  await expect(page.getByRole("status")).toContainText("目前這組已標記 2 個單字");
  await expect(words.nth(1)).not.toHaveClass(/is-highlighted/);
  await expect.poll(async () => (await storedHighlights(page))[0]?.occurrenceKeys.length).toBe(2);
  await expect(words.nth(2)).toHaveClass(/is-highlighted/);
  await expect.poll(() => storedHighlights(page)).toHaveLength(1);
  expect((await storedHighlights(page))[0].occurrenceKeys).toHaveLength(2);

  await words.nth(1).click();
  await expect(firstParagraph.locator(".reading-highlight-gap")).toHaveCount(2);
  expect((await storedHighlights(page))[0].occurrenceKeys).toHaveLength(3);

  await page.reload();
  const reloadedParagraph = page.locator("[data-reading-paragraph]").first();
  await expect(reloadedParagraph.locator(".reading-word.is-highlighted")).toHaveCount(3);
  await reloadedParagraph.getByRole("button", { name: "開啟螢光筆工具" }).click();
  await reloadedParagraph.getByRole("button", { name: "橡皮擦" }).click();
  await reloadedParagraph.locator(".reading-word").nth(1).click();
  await expect(reloadedParagraph.locator(".reading-word").nth(1)).not.toHaveClass(/is-highlighted/);
  expect((await storedHighlights(page))[0].occurrenceKeys).toHaveLength(2);

  await reloadedParagraph.locator(".reading-word").nth(0).click();
  await reloadedParagraph.locator(".reading-word").nth(2).click();
  await expect.poll(() => storedHighlights(page)).toEqual([]);
});

test("paints and erases words by dragging across the paragraph", async ({ page }) => {
  await createMaterial(page, "螢光拖曳測試", "A bear runs quickly.");
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const paragraph = page.locator("[data-reading-paragraph]").first();
  const entry = paragraph.getByRole("button", { name: "開啟螢光筆工具" });
  const words = paragraph.locator(".reading-word");
  await entry.click();
  await paragraph.getByRole("button", { name: "淡黃色螢光筆" }).click();

  const firstWord = await words.nth(0).boundingBox();
  const secondWord = await words.nth(1).boundingBox();
  const thirdWord = await words.nth(2).boundingBox();
  if (!firstWord || !secondWord || !thirdWord) throw new Error("找不到拖曳測試單字位置。");
  await page.mouse.move(firstWord.x + firstWord.width / 2, firstWord.y + firstWord.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondWord.x + secondWord.width / 2, secondWord.y + secondWord.height / 2);
  await page.mouse.move(thirdWord.x + thirdWord.width / 2, thirdWord.y + thirdWord.height / 2);
  await page.mouse.up();

  await expect(words.nth(0)).toHaveClass(/is-highlighted/);
  await expect(words.nth(1)).toHaveClass(/is-highlighted/);
  await expect(words.nth(2)).toHaveClass(/is-highlighted/);
  await expect.poll(async () => (await storedHighlights(page))[0]?.occurrenceKeys.length).toBe(3);

  await entry.click();
  await expect(entry).toHaveAttribute("aria-pressed", "false");
  await expect(entry).toHaveCSS("border-top-right-radius", "8px");
  await entry.click();
  await paragraph.getByRole("button", { name: "橡皮擦" }).click();
  await expect(words.nth(0)).toHaveCSS("cursor", /url\(/);
  await page.mouse.move(firstWord.x + firstWord.width / 2, firstWord.y + firstWord.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondWord.x + secondWord.width / 2, secondWord.y + secondWord.height / 2);
  await page.mouse.up();

  await expect(words.nth(0)).not.toHaveClass(/is-highlighted/);
  await expect(words.nth(1)).not.toHaveClass(/is-highlighted/);
  await expect(words.nth(2)).toHaveClass(/is-highlighted/);
  await expect.poll(async () => (await storedHighlights(page))[0]?.occurrenceKeys).toHaveLength(1);
});

test("limits tools to one paragraph, supports keyboard, and restores word cards after exit", async ({ page }) => {
  await createMaterial(page, "螢光鍵盤測試", "A bear runs.\n\nThe fox sleeps.");
  await page.getByRole("link", { name: "開始閱讀" }).click();
  const paragraphs = page.locator("[data-reading-paragraph]");
  const firstEntry = paragraphs.nth(0).getByRole("button", { name: "開啟螢光筆工具" });
  const secondEntry = paragraphs.nth(1).getByRole("button", { name: "開啟螢光筆工具" });

  await firstEntry.click();
  await paragraphs.nth(0).getByRole("button", { name: "淡黃色螢光筆" }).click();
  const firstWord = paragraphs.nth(0).locator(".reading-word").first();
  await firstWord.focus();
  await page.keyboard.press("Enter");
  await expect(firstWord).toHaveClass(/is-highlighted/);

  await secondEntry.click();
  await paragraphs.nth(1).getByRole("button", { name: "淡黃色螢光筆" }).click();
  await expect(firstEntry).toHaveAttribute("aria-pressed", "false");
  await expect(secondEntry).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(secondEntry).toHaveAttribute("aria-pressed", "false");

  await firstWord.hover();
  await expect(page.getByRole("complementary", { name: "a" })).toBeVisible();
});
