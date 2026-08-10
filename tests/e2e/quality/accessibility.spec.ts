import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { seedKnownWordsForCurrentMaterial } from "../application/test-helpers";

async function createAccessibleMaterial(
  page: Page,
  content = "A bear reads a book.",
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "新增教材" }).click();
  await page.getByLabel("教材名稱（選填）").fill("無障礙測試教材");
  await page.getByLabel("直接貼上文字").fill(content);
  await page.getByRole("button", { name: "儲存教材" }).click();
}

async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
}

test("home and shared dialogs meet the automated accessibility baseline", async ({ page }) => {
  await page.goto("/");
  await expectNoAccessibilityViolations(page);

  await page.getByRole("button", { name: "新增教材" }).click();
  const addDialog = page.getByRole("dialog", { name: "新增學習教材" });
  await expect(addDialog).toBeVisible();
  await expect(addDialog.getByRole("button", { name: "關閉" })).toBeFocused();
  await expectNoAccessibilityViolations(page);

  await page.keyboard.press("Escape");
  await expect(addDialog).toBeHidden();
  await expect(page.getByRole("button", { name: "新增教材" })).toBeFocused();
});

test("reading view meets accessibility and narrow-layout baselines", async ({ page }) => {
  await createAccessibleMaterial(
    page,
    Array.from({ length: 80 }, () => "A bear reads a book.").join("\n\n"),
  );
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("");
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.getByRole("heading", { name: "無障礙測試教材", level: 1 })).toBeVisible();

  await expectNoAccessibilityViolations(page);
  await expectNoHorizontalOverflow(page);
  const readingScrollMetrics = await page.locator(".reading-content").evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
  }));
  expect(readingScrollMetrics.overflowY).toBe("visible");
  expect(readingScrollMetrics.scrollHeight - readingScrollMetrics.clientHeight)
    .toBeLessThanOrEqual(1);
  const readingBounds = await page.locator(".reading-content").evaluate((element) => ({
    bottom: element.getBoundingClientRect().bottom,
    viewportHeight: window.innerHeight,
  }));
  expect(readingBounds.bottom).toBeGreaterThan(readingBounds.viewportHeight);
});

test("reduced motion disables familiarity animations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createAccessibleMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page).toHaveURL(/#\/materials\/.+/);
  await seedKnownWordsForCurrentMaterial(page, ["bear"]);
  await page.reload();

  const familiarityPresentation = await page.locator('[data-known-word="bear"]')
    .evaluate((element) => {
      const glyph = element.querySelector(".known-word__glyph");
      const style = glyph ? getComputedStyle(glyph) : null;
      return {
        animationName: style?.animationName ?? "",
        textShadow: style?.textShadow ?? "none",
      };
    });
  expect(familiarityPresentation.animationName).toBe("none");
  expect(familiarityPresentation.textShadow).not.toBe("none");

  await page.locator('[data-known-word="bear"]').first().hover();
  const cardFamiliarityPresentation = await page.getByRole("heading", { name: "bear", level: 2 })
    .locator(".known-word__glyph")
    .first()
    .evaluate((element) => ({
      animationName: getComputedStyle(element).animationName,
      textShadow: getComputedStyle(element).textShadow,
    }));
  expect(cardFamiliarityPresentation.animationName).toBe("none");
  expect(cardFamiliarityPresentation.textShadow).not.toBe("none");
});

test("primary pages and data dialog remain responsive at supported breakpoints", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Run the viewport matrix once.");
  await createAccessibleMaterial(page);

  const viewports = [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 844, height: 390 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "開啟資料管理" }).click();
    const dataDialog = page.getByRole("dialog", { name: "資料管理" });
    await expect(dataDialog).toBeVisible();
    const dialogBox = await dataDialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: "開始閱讀" }).click();
    await expect(page.locator(".material-heading")).toBeAttached();
    await expect(page.locator(".material-completion")).toBeAttached();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("button", { name: "教材詞彙" })).toHaveCount(0);
    const materialLayoutMetrics = await page.evaluate(() => {
      const headingStyle = getComputedStyle(document.querySelector<HTMLElement>(".material-heading")!);
      const completionStyle = getComputedStyle(document.querySelector<HTMLElement>(".material-completion")!);
      const completionButton = document.querySelector<HTMLElement>(".material-completion__button")!;
      const completionButtonStyle = getComputedStyle(completionButton);
      return {
        headingMarginBottom: Number.parseFloat(headingStyle.marginBottom),
        headingPaddingBottom: Number.parseFloat(headingStyle.paddingBottom),
        completionMarginTop: Number.parseFloat(completionStyle.marginTop),
        completionPaddingTop: Number.parseFloat(completionStyle.paddingTop),
        completionPaddingBottom: Number.parseFloat(completionStyle.paddingBottom),
        completionButtonHeight: completionButton.getBoundingClientRect().height,
        completionButtonMinHeight: Number.parseFloat(completionButtonStyle.minHeight),
      };
    });
    expect(materialLayoutMetrics.headingMarginBottom).toBeCloseTo(materialLayoutMetrics.headingPaddingBottom, 3);
    expect(materialLayoutMetrics.completionPaddingTop).toBeCloseTo(materialLayoutMetrics.completionPaddingBottom, 3);
    expect(materialLayoutMetrics.headingMarginBottom).toBeLessThanOrEqual(28);
    expect(materialLayoutMetrics.completionMarginTop).toBeLessThanOrEqual(28);
    expect(materialLayoutMetrics.completionPaddingTop).toBeLessThanOrEqual(14);
    expect(materialLayoutMetrics.completionButtonHeight).toBeLessThanOrEqual(42);
    expect(materialLayoutMetrics.completionButtonMinHeight).toBe(40);
  }
});
