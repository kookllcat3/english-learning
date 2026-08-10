import { expect, test } from "@playwright/test";

const MAX_FIRST_CONTENTFUL_PAINT_MS = 2_000;
const MAX_LARGE_MATERIAL_OPEN_MS = 2_000;
const MAX_LAST_PARAGRAPH_PROGRESS_MS = 500;
const MAX_DIALOG_OPEN_MS = 120;

async function waitForDialogOpen(dialog: import("@playwright/test").Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("open", "");
}

test("keeps startup and large-material opening within the performance baseline", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const firstContentfulPaint = await page.evaluate(() =>
    performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0);
  expect(firstContentfulPaint).toBeGreaterThan(0);
  expect(firstContentfulPaint).toBeLessThan(MAX_FIRST_CONTENTFUL_PAINT_MS);

  const words = Array.from({ length: 350 }, (_, index) => `term${String.fromCharCode(
    97 + Math.floor(index / 26),
    97 + (index % 26),
  )}`);
  await page.getByRole("button", { name: "新增教材" }).click();
  await page.getByLabel("教材名稱（選填）").fill("效能基線教材");
  await page.getByLabel("直接貼上文字").fill(words.join(" "));
  await page.getByRole("button", { name: "儲存教材" }).click();

  const interactionStart = Date.now();
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.locator(".reading-word")).toHaveCount(350);
  const largeMaterialOpen = Date.now() - interactionStart;
  expect(largeMaterialOpen).toBeLessThan(MAX_LARGE_MATERIAL_OPEN_MS);

  testInfo.annotations.push(
    { type: "first-contentful-paint", description: `${Math.round(firstContentfulPaint)} ms` },
    { type: "large-material-open", description: `${largeMaterialOpen} ms` },
  );
});

test("keeps dialogs responsive", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const guideDialog = page.getByRole("dialog", { name: "如何製作學習教材" });
  const guideDuration = await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>(
      'button[aria-label="查看教材製作教學"]',
    );
    if (!button) throw new Error("Guide button was not found.");
    const startedAt = performance.now();
    button.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return performance.now() - startedAt;
  });
  await waitForDialogOpen(guideDialog);
  expect(guideDuration).toBeLessThan(MAX_DIALOG_OPEN_MS);
  await expect.poll(() => guideDialog.evaluate((element) =>
    getComputedStyle(element).animationName)).toBe("dialog-enter");
  const guideOverflow = await guideDialog.evaluate((element) => {
    const body = element.querySelector<HTMLElement>(".dialog__body");
    const prompt = element.querySelector<HTMLTextAreaElement>("textarea");
    if (!body || !prompt) throw new Error("Guide dialog layout was incomplete.");
    return {
      bodyFits: body.scrollHeight <= body.clientHeight + 1,
      dialogFits: element.scrollHeight <= element.clientHeight + 1,
      promptCanScroll: prompt.scrollHeight > prompt.clientHeight,
    };
  });
  expect(guideOverflow).toEqual({
    bodyFits: true,
    dialogFits: true,
    promptCanScroll: true,
  });

  await expect(guideDialog.getByRole("tablist")).toHaveCount(0);
  await expect(guideDialog.getByRole("button", { name: "複製提示詞" })).toBeVisible();

  await guideDialog.getByRole("button", { name: "關閉" }).click();
  await expect(guideDialog).toBeHidden();

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  const dataDialogDuration = await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>(
      'button[aria-label="開啟資料管理"]',
    );
    if (!button) throw new Error("Data management button was not found.");
    const startedAt = performance.now();
    button.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return performance.now() - startedAt;
  });
  await waitForDialogOpen(dataDialog);
  expect(dataDialogDuration).toBeLessThan(MAX_DIALOG_OPEN_MS);

  testInfo.annotations.push(
    { type: "guide-dialog", description: `${guideDuration} ms` },
    { type: "data-dialog", description: `${dataDialogDuration} ms` },
  );
});

test("marks a long material through its last paragraph within the progress baseline", async ({
  page,
}, testInfo) => {
  const words = Array.from({ length: 350 }, (_, index) => `term${String.fromCharCode(
    97 + Math.floor(index / 26),
    97 + (index % 26),
  )}`);
  const content = Array.from({ length: 70 }, (_, paragraphIndex) => {
    const paragraphWords = words.slice(paragraphIndex * 5, paragraphIndex * 5 + 5);
    return `${paragraphWords.join(" ")}.\n這是第 ${paragraphIndex + 1} 段翻譯。`;
  }).join("\n\n");

  await page.goto("/");
  await page.getByRole("button", { name: "新增教材" }).click();
  await page.getByLabel("教材名稱（選填）").fill("閱讀進度效能教材");
  await page.getByLabel("直接貼上文字").fill(content);
  await page.getByRole("button", { name: "儲存教材" }).click();
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.locator(".reading-word")).toHaveCount(350);

  const lastParagraph = page.locator("[data-reading-paragraph]").last();
  const lastParagraphBookmark = lastParagraph.getByRole("button", { name: "將閱讀書籤設在此段" });
  await lastParagraphBookmark.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    (window as unknown as { progressStartedAt: number }).progressStartedAt = performance.now();
  });
  await lastParagraphBookmark.click();
  await expect(lastParagraph.getByRole("button", { name: "移除此段閱讀書籤" })).toBeVisible();
  const progressDuration = await page.evaluate(() => (
    performance.now() - (window as unknown as { progressStartedAt: number }).progressStartedAt
  ));

  expect(progressDuration).toBeLessThan(MAX_LAST_PARAGRAPH_PROGRESS_MS);
  testInfo.annotations.push({
    type: "last-paragraph-progress",
    description: `${Math.round(progressDuration)} ms for 350 unique words`,
  });
});
