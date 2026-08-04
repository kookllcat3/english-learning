import { expect, type Page } from "@playwright/test";

export const materialTitle = "Playwright 動物短文";
export const materialContent = "A bear runs. The bear sleeps.";
export const validWebpBase64 = "UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoBAAEAAUAmJaACdLoB+AAEgwAA/vS+7/56ZrzB/k5/8pV4LG5vgAAA";

export interface StoredContextualNote {
  markdown: string;
  occurrenceKey: string;
}

export async function storedContextualNotes(page: Page): Promise<StoredContextualNote[]> {
  return page.evaluate(async () => new Promise<StoredContextualNote[]>((resolve, reject) => {
    const request = indexedDB.open("english-learning");
    request.addEventListener("success", () => {
      const database = request.result;
      const records = database.transaction("contextualWordNotes", "readonly")
        .objectStore("contextualWordNotes")
        .getAll();
      records.addEventListener("success", () => {
        resolve(records.result.map((record) => ({
          markdown: record.markdown,
          occurrenceKey: record.occurrenceKey,
        })));
        database.close();
      }, { once: true });
      records.addEventListener("error", () => reject(records.error), { once: true });
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  }));
}

export function alphabeticWord(index: number): string {
  let value = index;
  let word = "";
  do {
    word = String.fromCharCode(97 + (value % 26)) + word;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return `word${word}`;
}

export async function createMaterial(
  page: Page,
  title = materialTitle,
  content = materialContent,
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "新增教材" }).click();
  await page.getByLabel("教材名稱（選填）").fill(title);
  await page.getByLabel("直接貼上文字").fill(content);
  await page.getByRole("button", { name: "儲存教材" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}
