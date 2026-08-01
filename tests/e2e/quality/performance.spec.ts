import { expect, test } from "@playwright/test";

const MAX_FIRST_CONTENTFUL_PAINT_MS = 2_000;
const MAX_LARGE_MATERIAL_INTERACTION_MS = 2_000;
const MAX_DIALOG_OPEN_MS = 120;
const MAX_PROMPT_TAB_SWITCH_MS = 150;

async function waitForDialogOpen(dialog: import("@playwright/test").Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("open", "");
}

test("keeps startup and large-list interaction within the performance baseline", async ({
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
  await page.getByRole("button", { name: "新增素材" }).click();
  await page.getByLabel("素材名稱（選填）").fill("效能基線素材");
  await page.getByLabel("直接貼上文字").fill(words.join(" "));
  await page.getByRole("button", { name: "儲存素材" }).click();

  const interactionStart = Date.now();
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.getByRole("button", { name: "素材詞彙" }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(300);
  const largeMaterialInteraction = Date.now() - interactionStart;
  expect(largeMaterialInteraction).toBeLessThan(MAX_LARGE_MATERIAL_INTERACTION_MS);

  testInfo.annotations.push(
    { type: "first-contentful-paint", description: `${Math.round(firstContentfulPaint)} ms` },
    { type: "large-material-interaction", description: `${largeMaterialInteraction} ms` },
  );
});

test("keeps dialogs and prompt tabs responsive", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const guideDialog = page.getByRole("dialog", { name: "如何製作學習素材" });
  const guideDuration = await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>(
      'button[aria-label="查看素材製作教學"]',
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

  const docxTab = guideDialog.getByRole("tab", { name: "圖文" });
  const promptSwitchDuration = await page.evaluate(async () => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find((candidate) => candidate.textContent?.trim() === "圖文");
    if (!button) throw new Error("DOCX prompt tab was not found.");
    const startedAt = performance.now();
    button.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve())));
    return performance.now() - startedAt;
  });
  await expect(docxTab).toHaveClass(/is-active/);
  await expect(guideDialog.locator("textarea")).toHaveValue(/圖文文件設計師/);
  expect(promptSwitchDuration).toBeLessThan(MAX_PROMPT_TAB_SWITCH_MS);

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
    { type: "prompt-tab-switch", description: `${promptSwitchDuration} ms` },
    { type: "data-dialog", description: `${dataDialogDuration} ms` },
  );
});
