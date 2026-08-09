import { expect, test, type Page } from "@playwright/test";

import {
  createMaterial,
  materialTitle,
} from "./test-helpers";

interface LegacyMaterialFixture {
  content: string;
  createdAt: string;
  description: string;
  id: string;
  knownWords: string[];
  title: string;
  updatedAt: string;
}

async function importLegacyMaterials(
  page: Page,
  materials: LegacyMaterialFixture[],
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "library-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 1,
      materials,
      vocabulary: [],
    }), "utf8"),
  });
  await expect(page.locator(".data-management-dialog").getByRole("status"))
    .toContainText("備份已匯入");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
}

function materialFixture(
  index: number,
  title: string,
  content: string,
  knownWords: string[],
  createdOffset: number,
  updatedOffset = createdOffset,
): LegacyMaterialFixture {
  const baseTime = Date.parse("2026-01-02T03:04:05.000Z");
  return {
    id: `7e4fafc8-9533-4a3e-bfb6-69fe4cc88a${String(index).padStart(2, "0")}`,
    title,
    description: "",
    content,
    knownWords,
    createdAt: new Date(baseTime + createdOffset * 1_000).toISOString(),
    updatedAt: new Date(baseTime + updatedOffset * 1_000).toISOString(),
  };
}

test("sorts by completion, then creation time, across pagination boundaries", async ({ page }) => {
  const zeroCompletion = Array.from({ length: 10 }, (_, index) => materialFixture(
    index,
    `Zero ${String(index + 1).padStart(2, "0")}`,
    index === 9 ? "WORD POWER: alpha 中文" : "alpha beta.",
    [],
    index + 20,
  ));
  const materials = [
    ...zeroCompletion,
    materialFixture(10, "Half newer creation", "alpha beta.", ["alpha"], 12, 1),
    materialFixture(11, "Half older creation", "alpha beta.", ["alpha"], 11, 99),
    materialFixture(12, "Complete newer creation", "alpha beta.", ["alpha", "beta"], 10),
    materialFixture(13, "Complete older creation", "alpha beta.", ["alpha", "beta"], 9),
  ];
  await importLegacyMaterials(page, materials);

  await page.getByRole("radio", { name: "完成度" }).click();
  await expect(page.locator(".material-grid")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".material-card h2")).toHaveText([
    "Zero 10",
    "Zero 09",
    "Zero 08",
    "Zero 07",
    "Zero 06",
    "Zero 05",
    "Zero 04",
    "Zero 03",
    "Zero 02",
    "Zero 01",
    "Half newer creation",
    "Half older creation",
  ]);

  await page.getByRole("button", { name: "下一頁" }).click();
  await expect(page.getByText("第 2 / 2 頁")).toBeVisible();
  await expect(page.locator(".material-card h2")).toHaveText([
    "Complete newer creation",
    "Complete older creation",
  ]);
});

test("keeps the viewport stable and card heights aligned while sorting", async ({ page }) => {
  const titles = [
    "30隻動物",
    "Childish Gambino - This Is America",
    "blink-182 - ONE MORE TIME",
    "blink-182 - I Miss You",
  ];
  const contents = [
    "alpha beta gamma",
    "delta epsilon",
    "zeta eta",
    "theta iota kappa",
  ];
  const knownWords = [[], ["delta"], ["zeta"], ["theta", "iota"]];
  await importLegacyMaterials(page, titles.map((title, index) => materialFixture(
    index,
    title,
    contents[index],
    knownWords[index],
    index,
    titles.length - index,
  )));

  const sortOptions = page.getByRole("group", { name: "教材排序方式" });
  if ((page.viewportSize()?.width ?? 0) > 720) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  } else {
    await sortOptions.evaluate((element) => element.scrollIntoView({ block: "center" }));
  }
  const scrollPositionBeforeSorting = await page.evaluate(() => window.scrollY);

  await page.getByRole("radio", { name: "名稱" }).click();
  await expect(page.locator(".material-grid")).toHaveAttribute("aria-busy", "false");
  const scrollPositionAfterSorting = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollPositionAfterSorting - scrollPositionBeforeSorting)).toBeLessThanOrEqual(1);

  const shortTitleCard = page.getByRole("article").filter({ hasText: "30隻動物" });
  const cardHeightsBeforeProgressSort = await page.locator(".material-card").evaluateAll(
    (elements) => elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(new Set(cardHeightsBeforeProgressSort).size).toBe(1);
  const cardHeightBeforeProgressSort = await shortTitleCard.evaluate(
    (element) => element.getBoundingClientRect().height,
  );

  await page.getByRole("radio", { name: "完成度" }).click();
  await expect(page.locator(".material-grid")).toHaveAttribute("aria-busy", "false");
  const cardHeightAfterProgressSort = await shortTitleCard.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  const cardHeightsAfterProgressSort = await page.locator(".material-card").evaluateAll(
    (elements) => elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(new Set(cardHeightsAfterProgressSort).size).toBe(1);
  expect(cardHeightAfterProgressSort).toBe(cardHeightBeforeProgressSort);
});

test("rolls back the material deletion when vocabulary reconciliation fails", async ({ page }) => {
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(value, key) {
      if (
        sessionStorage.getItem("simulateDeletionFailure") === "true"
        && this.name === "vocabulary"
      ) {
        throw new DOMException("Simulated deletion failure", "QuotaExceededError");
      }
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
    };
  });
  await createMaterial(page, materialTitle, "A bear runs.");
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.getByRole("button", { name: "完成本次學習" }).click();
  await expect(page.getByRole("button", { name: "本篇單字已全部認識" })).toBeDisabled();
  await page.getByRole("link", { name: "回到英文學習庫首頁" }).click();
  await page.evaluate(() => sessionStorage.setItem("simulateDeletionFailure", "true"));

  const dialogMessages: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogMessages.push(dialog.message());
    if (dialog.type() === "confirm") await dialog.accept();
    else await dialog.dismiss();
  });
  await page.getByRole("button", { name: `移除教材 ${materialTitle}` }).click();

  await expect.poll(() => dialogMessages.join("\n"))
    .toContain("教材移除失敗，原有資料未變更。");
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
});
