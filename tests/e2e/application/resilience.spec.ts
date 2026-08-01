import { expect, test, type Page } from "@playwright/test";

async function createMaterial(page: Page, title: string, content: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "新增素材" }).click();
  await page.getByLabel("素材名稱（選填）").fill(title);
  await page.getByLabel("直接貼上文字").fill(content);
  await page.getByRole("button", { name: "儲存素材" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test("propagates material changes across tabs", async ({ page }) => {
  const secondPage = await page.context().newPage();
  await Promise.all([page.goto("/"), secondPage.goto("/")]);

  await page.getByRole("button", { name: "新增素材" }).click();
  await page.getByLabel("素材名稱（選填）").fill("跨分頁素材");
  await page.getByLabel("直接貼上文字").fill("Shared tab material.");
  await page.getByRole("button", { name: "儲存素材" }).click();

  await expect(secondPage.getByRole("heading", { name: "跨分頁素材" })).toBeVisible();
  await secondPage.close();
});

test("keeps local learning progress writable while offline", async ({ page, context }) => {
  await createMaterial(page, "離線素材", "A bear sleeps.");
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.getByRole("heading", { name: "離線素材", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "素材詞彙" }).click();
  const bearCheckbox = page.getByRole("checkbox", { name: /bear/ });
  await expect(bearCheckbox).toBeVisible();

  await context.setOffline(true);
  try {
    await bearCheckbox.check();
    await expect(page.getByText(/已認識\s+1\s+\/\s+3\s+個/)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }

  await page.reload();
  await page.getByRole("button", { name: "素材詞彙" }).click();
  await expect(page.getByRole("checkbox", { name: /bear/ })).toBeChecked();
});

test("upgrades a version 1 IndexedDB material in place", async ({ page }) => {
  await page.goto("/assets/config/familiarity-levels.json");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("english-learning");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("english-learning", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        const materials = database.createObjectStore("materials", { keyPath: "id" });
        materials.createIndex("updatedAt", "updatedAt");
        materials.createIndex("title", "title");
        const vocabulary = database.createObjectStore("vocabulary", { keyPath: "word" });
        vocabulary.createIndex("learned", "learned");
        vocabulary.createIndex("updatedAt", "updatedAt");
        database.createObjectStore("settings", { keyPath: "key" });
        materials.put({
          id: "82b5d947-cf8a-4225-98e5-09672ea30bf6",
          title: "舊資料庫素材",
          description: "",
          content: "Animal",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        });
        vocabulary.put({
          word: "animal",
          learned: true,
          learnedAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });

  await page.goto("/");
  const migratedCard = page.getByRole("article").filter({ hasText: "舊資料庫素材" });
  await expect(migratedCard).toContainText("1 / 1");
  await migratedCard.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.getByText("Animal", { exact: true })).toBeVisible();
});
