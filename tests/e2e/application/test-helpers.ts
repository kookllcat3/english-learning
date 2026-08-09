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

export interface StoredHighlight {
  id: string;
  occurrenceKeys: string[];
  paragraphKey: string;
}

interface StoredAnnotationHighlight {
  id: string;
  kind: string;
  target: { occurrenceKeys: string[]; paragraphKey: string };
}

interface StoredLegacyContextualNote {
  body: { value: string };
  kind: string;
  target: { occurrenceKey: string };
}

async function storedRecords<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate(async (name) => new Promise<T[]>((resolve, reject) => {
    const request = indexedDB.open("english-learning");
    request.addEventListener("success", () => {
      const database = request.result;
      const records = database.transaction(name, "readonly").objectStore(name).getAll();
      records.addEventListener("success", () => {
        resolve(records.result);
        database.close();
      }, { once: true });
      records.addEventListener("error", () => {
        database.close();
        reject(records.error);
      }, { once: true });
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  }), storeName);
}

async function storedCurrentMaterial<T>(page: Page): Promise<T> {
  return page.evaluate(async () => new Promise<T>((resolve, reject) => {
    const materialId = location.hash.match(/^#\/materials\/([^/?]+)/)?.[1];
    if (!materialId) {
      reject(new Error("Material route was not active."));
      return;
    }
    const request = indexedDB.open("english-learning");
    request.addEventListener("success", () => {
      const database = request.result;
      const materialRequest = database.transaction("materials", "readonly")
        .objectStore("materials")
        .get(materialId);
      materialRequest.addEventListener("success", () => {
        database.close();
        if (materialRequest.result === undefined) {
          reject(new Error("Stored material was not found."));
          return;
        }
        resolve(materialRequest.result);
      }, { once: true });
      materialRequest.addEventListener("error", () => {
        database.close();
        reject(materialRequest.error);
      }, { once: true });
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  }));
}

export async function storedSettingValue(
  page: Page,
  key: string,
): Promise<unknown> {
  return page.evaluate(async (settingKey) => new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open("english-learning");
    request.addEventListener("success", () => {
      const database = request.result;
      const settingRequest = database.transaction("settings", "readonly")
        .objectStore("settings")
        .get(settingKey);
      settingRequest.addEventListener("success", () => {
        resolve(settingRequest.result?.value);
        database.close();
      }, { once: true });
      settingRequest.addEventListener("error", () => {
        database.close();
        reject(settingRequest.error);
      }, { once: true });
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  }), key);
}

export async function storedHighlights(page: Page): Promise<StoredHighlight[]> {
  const records = await storedRecords<StoredAnnotationHighlight>(page, "materialAnnotations");
  return records
    .filter((record) => record.kind === "highlight")
    .map((record) => ({
      id: record.id,
      occurrenceKeys: record.target.occurrenceKeys,
      paragraphKey: record.target.paragraphKey,
    }));
}

export async function storedCurrentMaterialKnownWords(
  page: Page,
): Promise<string[]> {
  const material = await storedCurrentMaterial<{ knownWords?: string[] }>(page);
  return material.knownWords ?? [];
}

export async function storedCurrentMaterialReadingParagraphKey(
  page: Page,
): Promise<string | null> {
  const material = await storedCurrentMaterial<{ readingParagraphKey?: string | null }>(page);
  return material.readingParagraphKey ?? null;
}

export async function storedWordNotes(page: Page): Promise<StoredWordNote[]> {
  const records = await storedRecords<StoredWordNote>(page, "wordNotes");
  return records.map(({ markdown, word }) => ({ markdown, word }));
}

export async function storedContextualNotes(page: Page): Promise<StoredContextualNote[]> {
  const records = await storedRecords<StoredLegacyContextualNote>(page, "materialAnnotations");
  return records
    .filter((record) => record.kind === "legacy-contextual-word-note")
    .map((record) => ({
      markdown: record.body.value,
      occurrenceKey: record.target.occurrenceKey,
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
