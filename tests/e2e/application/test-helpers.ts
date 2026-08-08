import { expect, type Page } from "@playwright/test";

export const materialTitle = "Playwright 動物短文";
export const materialContent = "A bear runs. The bear sleeps.";
export const validWebpBase64 = "UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoBAAEAAUAmJaACdLoB+AAEgwAA/vS+7/56ZrzB/k5/8pV4LG5vgAAA";

export interface StoredContextualNote {
  markdown: string;
  occurrenceKey: string;
}

export interface StoredWordNote {
  markdown: string;
  word: string;
}

export async function storedWordNotes(page: Page): Promise<StoredWordNote[]> {
  return page.evaluate(async () => new Promise<StoredWordNote[]>((resolve, reject) => {
    const request = indexedDB.open("english-learning");
    request.addEventListener("success", () => {
      const database = request.result;
      const records = database.transaction("wordNotes", "readonly")
        .objectStore("wordNotes")
        .getAll();
      records.addEventListener("success", () => {
        resolve(records.result.map((record) => ({
          markdown: record.markdown,
          word: record.word,
        })));
        database.close();
      }, { once: true });
      records.addEventListener("error", () => reject(records.error), { once: true });
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  }));
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

export async function seedKnownWordsForCurrentMaterial(
  page: Page,
  words: string[],
): Promise<void> {
  await page.evaluate(async (knownWords) => {
    const materialId = location.hash.match(/^#\/materials\/([^/?]+)/)?.[1];
    if (!materialId) throw new Error("Material route was not active.");
    await new Promise<void>((resolve, reject) => {
      const openRequest = indexedDB.open("english-learning");
      openRequest.addEventListener("success", () => {
        const database = openRequest.result;
        const transaction = database.transaction(["materials", "vocabulary"], "readwrite");
        const materialStore = transaction.objectStore("materials");
        const vocabularyStore = transaction.objectStore("vocabulary");
        const materialRequest = materialStore.get(materialId);
        materialRequest.addEventListener("success", () => {
          const material = materialRequest.result;
          if (!material) {
            transaction.abort();
            return;
          }
          const timestamp = new Date().toISOString();
          const mergedWords = [...new Set([...(material.knownWords ?? []), ...knownWords])];
          materialStore.put({ ...material, knownWords: mergedWords, updatedAt: timestamp });
          knownWords.forEach((word) => vocabularyStore.put({
            learned: true,
            learnedAt: timestamp,
            updatedAt: timestamp,
            word,
          }));
        }, { once: true });
        transaction.addEventListener("complete", () => {
          database.close();
          resolve();
        }, { once: true });
        transaction.addEventListener("abort", () => {
          database.close();
          reject(transaction.error ?? new Error("Unable to seed known words."));
        }, { once: true });
      }, { once: true });
      openRequest.addEventListener("error", () => reject(openRequest.error), { once: true });
    });
  }, words);
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
