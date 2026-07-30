import { expect, test } from "@playwright/test";

const MAX_FIRST_CONTENTFUL_PAINT_MS = 2_000;
const MAX_LARGE_MATERIAL_INTERACTION_MS = 2_000;

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
  if ((page.viewportSize()?.width ?? 0) <= 720) {
    await page.getByRole("button", { name: "素材詞彙" }).click();
  }
  await expect(page.getByRole("checkbox")).toHaveCount(300);
  const largeMaterialInteraction = Date.now() - interactionStart;
  expect(largeMaterialInteraction).toBeLessThan(MAX_LARGE_MATERIAL_INTERACTION_MS);

  testInfo.annotations.push(
    { type: "first-contentful-paint", description: `${Math.round(firstContentfulPaint)} ms` },
    { type: "large-material-interaction", description: `${largeMaterialInteraction} ms` },
  );
});
