import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function createAccessibleMaterial(
  page: Page,
  content = "A bear reads a book.",
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "新增素材" }).click();
  await page.getByLabel("素材名稱（選填）").fill("無障礙測試素材");
  await page.getByLabel("直接貼上文字").fill(content);
  await page.getByRole("button", { name: "儲存素材" }).click();
}

async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("home and shared dialogs meet the automated accessibility baseline", async ({ page }) => {
  await page.goto("/");
  await expectNoAccessibilityViolations(page);

  await page.getByRole("button", { name: "新增素材" }).click();
  const addDialog = page.getByRole("dialog", { name: "新增學習素材" });
  await expect(addDialog).toBeVisible();
  await expect(addDialog.getByRole("button", { name: "關閉" })).toBeFocused();
  await expectNoAccessibilityViolations(page);

  await page.keyboard.press("Escape");
  await expect(addDialog).toBeHidden();
  await expect(page.getByRole("button", { name: "新增素材" })).toBeFocused();
});

test("reading view meets accessibility and narrow-layout baselines", async ({ page }) => {
  await createAccessibleMaterial(
    page,
    Array.from({ length: 80 }, () => "A bear reads a book.").join("\n\n"),
  );
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.getByRole("heading", { name: "無障礙測試素材", level: 1 })).toBeVisible();

  await expectNoAccessibilityViolations(page);
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  const readingScrollMetrics = await page.locator(".reading-content").evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
  }));
  expect(readingScrollMetrics.overflowY).toBe("auto");
  expect(readingScrollMetrics.scrollHeight).toBeGreaterThan(readingScrollMetrics.clientHeight);
});

test("reduced motion disables familiarity animations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createAccessibleMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  if ((page.viewportSize()?.width ?? 0) <= 720) {
    await page.getByRole("button", { name: "素材詞彙" }).click();
  }
  await page.getByRole("checkbox", { name: /bear/ }).check();
  if ((page.viewportSize()?.width ?? 0) <= 720) {
    await page.getByRole("button", { name: "閱讀內容" }).click();
  }

  const animationName = await page.locator('[data-known-word="bear"]')
    .evaluate((element) => {
      const glyph = element.querySelector(".known-word__glyph");
      return glyph ? getComputedStyle(glyph).animationName : "";
    });
  expect(animationName).toBe("none");
});
