import { expect, test } from "@playwright/test";

import {
  createMaterial,
  materialTitle,
  storedCurrentMaterialKnownWords,
} from "./test-helpers";

test("copies paragraphs and keeps one reading position", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copiedParagraph?: string }).copiedParagraph = text;
        },
      },
    });
  });
  await createMaterial(
    page,
    materialTitle,
    "A bear runs.\n中文翻譯。\n補充翻譯。\n\nThe fox sleeps.\n另一段翻譯。\n\nNo translation here.",
  );
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const paragraphs = page.locator("[data-reading-paragraph]");
  await expect(paragraphs).toHaveCount(3);
  await expect(page.getByRole("button", { name: "將本段單字標記為認識" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "標記目前閱讀段落" })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "複製整段英文" })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "隱藏這段中文翻譯" })).toHaveCount(2);

  const firstToolbar = paragraphs.nth(0).getByRole("group", { name: "段落閱讀工具" });
  await expect(firstToolbar).toHaveCount(1);
  expect(await paragraphs.nth(0).evaluate((paragraph) =>
    paragraph.firstElementChild?.classList.contains("paragraph-toolbar"))).toBe(true);
  expect(await firstToolbar.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label")))).toEqual([
    "標記目前閱讀段落",
    "隱藏這段中文翻譯",
    "複製整段英文",
  ]);
  expect(await paragraphs.nth(2).getByRole("group", { name: "段落閱讀工具" })
    .getByRole("button").evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")))).toEqual([
    "標記目前閱讀段落",
    "複製整段英文",
  ]);

  const firstTranslationToggle = firstToolbar.getByRole("button").nth(1);
  const firstTranslations = paragraphs.nth(0).locator(".reading-line-wrap.is-translation .reading-line");
  await expect(firstTranslations).toHaveCount(2);
  await firstTranslationToggle.click();
  await expect(firstTranslationToggle).toHaveAccessibleName("顯示這段中文翻譯");
  await expect(firstTranslationToggle).toHaveAttribute("aria-pressed", "true");
  await expect(firstTranslations).toHaveClass([/translation-mask/, /translation-mask/]);
  await firstTranslationToggle.click();
  await expect(firstTranslations).toHaveClass(["reading-line", "reading-line"]);

  const firstCopyButton = paragraphs.nth(0).getByRole("button", { name: "複製整段英文" });
  await firstCopyButton.focus();
  await page.keyboard.press("Enter");
  await expect(paragraphs.nth(0).getByRole("status")).toHaveText("已複製");
  expect(await page.evaluate(() =>
    (window as unknown as { copiedParagraph?: string }).copiedParagraph)).toBe("A bear runs.");
  await expect(firstCopyButton).toHaveAccessibleName("已複製整段英文");

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => Promise.reject(new Error("clipboard denied")) },
    });
  });
  await paragraphs.nth(1).getByRole("button", { name: "複製整段英文" }).click();
  await expect(paragraphs.nth(1).getByRole("alert")).toHaveText("複製失敗");

  const firstMarker = paragraphs.nth(0).getByRole("button", { name: "標記目前閱讀段落" });
  const secondMarker = paragraphs.nth(1).getByRole("button", { name: "標記目前閱讀段落" });
  await firstMarker.click();
  await expect(firstMarker).toHaveAttribute("aria-pressed", "true");
  await secondMarker.click();
  await expect(firstMarker).toHaveAttribute("aria-pressed", "false");
  await expect(secondMarker).toHaveAttribute("aria-pressed", "true");
  await secondMarker.click();
  await expect(secondMarker).toHaveAttribute("aria-pressed", "false");

  await firstMarker.click();
  await expect(firstMarker).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(100);
  const firstParagraphKey = await paragraphs.nth(0).getAttribute("data-paragraph-key");
  const storedParagraphKey = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const records = await new Promise<Array<{ readingParagraphKey?: string | null }>>(
      (resolve, reject) => {
        const request = database.transaction("materials", "readonly")
          .objectStore("materials").getAll();
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error), { once: true });
      },
    );
    database.close();
    return records[0]?.readingParagraphKey ?? null;
  });
  expect(storedParagraphKey).toBe(firstParagraphKey);
  await page.reload();
  await expect(
    page.locator("[data-reading-paragraph]").nth(0)
      .getByRole("button", { name: "標記目前閱讀段落" }),
  ).toHaveAttribute("aria-pressed", "true");

  const reloadedMarkers = page.getByRole("button", { name: "標記目前閱讀段落" });
  await reloadedMarkers.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(reloadedMarkers.nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(reloadedMarkers.nth(1)).toHaveAttribute("aria-pressed", "true");
});

test("marks every word in the material as known from the footer action", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();

  await expect(page.getByText("完成這篇教材", { exact: true })).toHaveCount(0);
  await expect(page.getByText("將這篇教材的全部英文單字標記為認識，並更新學習進度。", { exact: true })).toHaveCount(0);
  const completionButton = page.getByRole("button", { name: "完成本次學習" });
  await completionButton.scrollIntoViewIfNeeded();
  await completionButton.click();

  await expect(page.getByRole("button", { name: "本篇單字已全部認識" })).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("已將本篇全部單字標記為認識。");
  await expect.poll(() => storedCurrentMaterialKnownWords(page))
    .toEqual(["a", "bear", "runs", "sleeps", "the"]);

  await page.reload();
  await expect(page.getByRole("button", { name: "本篇單字已全部認識" })).toBeDisabled();
  await expect(storedCurrentMaterialKnownWords(page))
    .resolves.toEqual(["a", "bear", "runs", "sleeps", "the"]);
});

test("classifies structured reading content and repairs polluted learning data", async ({ page }) => {
  const id = "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a27";
  const timestamp = "2026-08-02T08:00:00.000Z";
  const blocks = [
    { type: "text", order: 0, text: "A1 ENGLISH · 30 UNITS" },
    { type: "text", order: 1, text: "Meet the Animals" },
    { type: "text", order: 2, text: "01 Bird 鳥類" },
    { type: "text", order: 3, text: "EN Birds can fly." },
    { type: "text", order: 4, text: "中 birds 是鳥類。" },
    { type: "text", order: 5, text: "WORD POWER: avian 鳥類的" },
  ];
  const content = blocks.map((block) => block.text).join("\n");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "還沒有學習教材" })).toBeVisible();
  await page.evaluate(async ({ blocks: storedBlocks, content: storedContent, id: materialId, timestamp: storedTimestamp }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(
      ["materials", "materialContents", "materialTerms", "vocabulary", "contextualWordNotes", "settings"],
      "readwrite",
    );
    transaction.objectStore("materials").put({
      id: materialId,
      title: "Structured animal lesson",
      description: "",
      createdAt: storedTimestamp,
      updatedAt: storedTimestamp,
      wordCount: 11,
      knownCount: 3,
      knownWords: ["avian", "birds", "en"],
      readingParagraphKey: "0-0-0",
    });
    transaction.objectStore("materialContents").put({
      materialId,
      content: storedContent,
      contentBlocks: storedBlocks,
    });
    transaction.objectStore("materialTerms").put({
      materialId,
      words: ["a", "avian", "birds", "en", "fly", "power", "word"],
    });
    ["avian", "birds", "en"].forEach((word) => transaction.objectStore("vocabulary").put({
      word,
      learned: true,
      learnedAt: storedTimestamp,
      createdAt: storedTimestamp,
      updatedAt: storedTimestamp,
    }));
    transaction.objectStore("contextualWordNotes").put({
      id: `${encodeURIComponent(materialId)}::${encodeURIComponent("vocabulary:birds")}`,
      materialId,
      occurrenceKey: "vocabulary:birds",
      word: "birds",
      markdown: "keep this note",
      createdAt: storedTimestamp,
      updatedAt: storedTimestamp,
    });
    transaction.objectStore("settings").delete("readingContentClassificationVersion");
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
    });
    database.close();
  }, { blocks, content, id, timestamp });

  await page.addInitScript((materialId) => {
    if (sessionStorage.getItem("simulateClassificationMigrationFailure") !== "true") return;
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(value, key) {
      if (
        this.name === "materialTerms"
        && value?.materialId === materialId
      ) {
        throw new DOMException("Simulated migration failure", "UnknownError");
      }
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
    };
  }, id);
  await page.evaluate(() => {
    sessionStorage.setItem("simulateClassificationMigrationFailure", "true");
  });
  await page.reload();
  const failedMigration = await page.evaluate(async (materialId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(
      ["materials", "materialTerms", "vocabulary", "settings"],
      "readonly",
    );
    const read = <T>(store: string, key: IDBValidKey) => new Promise<T | undefined>((resolve, reject) => {
      const request = transaction.objectStore(store).get(key);
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const [material, terms, avian, setting] = await Promise.all([
      read<{ knownWords: string[] }>("materials", materialId),
      read<{ words: string[] }>("materialTerms", materialId),
      read<{ learned: boolean }>("vocabulary", "avian"),
      read<{ value: number }>("settings", "readingContentClassificationVersion"),
    ]);
    database.close();
    return {
      knownWords: material?.knownWords,
      terms: terms?.words,
      avianLearned: avian?.learned,
      version: setting?.value,
    };
  }, id);
  expect(failedMigration).toEqual({
    knownWords: ["avian", "birds", "en"],
    terms: ["a", "avian", "birds", "en", "fly", "power", "word"],
    avianLearned: true,
    version: undefined,
  });
  await page.evaluate(() => {
    sessionStorage.removeItem("simulateClassificationMigrationFailure");
  });
  await page.reload();
  const card = page.getByRole("article").filter({ hasText: "Structured animal lesson" });
  await expect(card).toContainText("1 / 3");
  await card.getByRole("link", { name: "開始閱讀" }).click();

  const readingGroup = page.locator("[data-reading-paragraph]");
  await expect(readingGroup).toHaveCount(1);
  await expect(readingGroup).toContainText("EN Birds can fly.");
  await expect(readingGroup).toContainText("中 birds 是鳥類。");
  await expect(page.getByRole("button", { name: "標記目前閱讀段落" })).toHaveCount(1);
  await expect(page.locator(".reading-line-wrap.is-translation")).toHaveCount(1);
  await expect(page.locator('[data-word="birds"]')).toHaveCount(1);
  await expect(page.locator('[data-word="en"]')).toHaveCount(0);
  await expect(page.locator('[data-word="avian"]')).toHaveCount(0);
  const paragraphToolbar = readingGroup.getByRole("group", { name: "段落閱讀工具" });
  await expect(paragraphToolbar).toHaveClass(/paragraph-toolbar/);
  await expect(paragraphToolbar.getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /編輯這段中文解釋/ })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /編輯這段中文解釋/ })).toHaveCount(0);
  await paragraphToolbar.getByRole("button", { name: "隱藏這段中文翻譯" }).click();
  await expect(page.locator(".reading-line-wrap.is-translation .reading-line"))
    .toHaveClass(/translation-mask/);
  await expect(page.getByRole("button", { name: "回到閱讀位置" })).toBeHidden();

  const migrated = await page.evaluate(async (materialId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(
      ["materials", "materialTerms", "vocabulary", "contextualWordNotes", "settings"],
      "readonly",
    );
    const read = <T>(store: string, key: IDBValidKey) => new Promise<T>((resolve, reject) => {
      const request = transaction.objectStore(store).get(key);
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const [material, terms, avian, en, note, setting] = await Promise.all([
      read<{ knownWords: string[]; readingParagraphKey: string | null; wordCount: number }>("materials", materialId),
      read<{ words: string[] }>("materialTerms", materialId),
      read<{ learned: boolean }>("vocabulary", "avian"),
      read<{ learned: boolean }>("vocabulary", "en"),
      read<{ markdown: string }>(
        "contextualWordNotes",
        `${encodeURIComponent(materialId)}::${encodeURIComponent("vocabulary:birds")}`,
      ),
      read<{ value: number }>("settings", "readingContentClassificationVersion"),
    ]);
    database.close();
    return {
      material: {
        knownWords: material.knownWords,
        readingParagraphKey: material.readingParagraphKey,
        wordCount: material.wordCount,
      },
      terms: { words: terms.words },
      avian: { learned: avian.learned },
      en: { learned: en.learned },
      note: { markdown: note.markdown },
      setting: { value: setting.value },
    };
  }, id);
  expect(migrated).toEqual({
    material: { knownWords: ["birds"], readingParagraphKey: null, wordCount: 3 },
    terms: { words: ["birds", "can", "fly"] },
    avian: { learned: false },
    en: { learned: false },
    note: { markdown: "keep this note" },
    setting: { value: 1 },
  });
});

test("offers a return action whenever a reading position is marked", async ({ page }) => {
  const paragraphs = Array.from(
    { length: 24 },
    (_, index) => {
      const original = index === 23
        ? `Paragraph ${index + 1} ${"contains additional words for a long reading line ".repeat(18)}`
        : `Paragraph ${index + 1} contains enough words for reading.`;
      return `${original}\n這是第 ${index + 1} 段翻譯。`;
    },
  ).join("\n\n");
  await createMaterial(page, materialTitle, paragraphs);
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const readingParagraphs = page.locator("[data-reading-paragraph]");
  const lastParagraph = readingParagraphs.last();
  const lastMarker = lastParagraph.getByRole("button", { name: "標記目前閱讀段落" });
  const returnAction = page.getByRole("button", { name: "回到閱讀位置" });

  await lastMarker.scrollIntoViewIfNeeded();
  await lastMarker.click();
  await expect(lastMarker).toHaveClass(/is-active/);
  await expect(lastParagraph.locator(".reading-line-wrap").first())
    .toHaveClass(/is-reading-position/);
  await expect(lastParagraph.locator(".reading-line-wrap.is-translation"))
    .not.toHaveClass(/is-reading-position/);
  await expect(returnAction).toBeVisible();
  expect(await returnAction.evaluate((button) => Boolean(button.closest(".material-heading")))).toBe(true);
  await expect(returnAction).toHaveClass(/is-floating/);
  await expect(returnAction).toHaveCSS("position", "fixed");
  await expect(page.locator(".material-view-switcher")).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(lastMarker).not.toBeInViewport();
  await expect(returnAction).toBeVisible();
  await expect(returnAction).not.toHaveClass(/is-floating/);
  await returnAction.focus();
  await page.keyboard.press("Enter");
  await expect(returnAction).toBeVisible();
  await expect(lastMarker).toBeFocused();
  await expect(lastParagraph).toBeInViewport();

  await lastMarker.click();
  await expect(lastMarker).toHaveAttribute("aria-pressed", "false");
  await expect(lastParagraph.locator(".reading-line-wrap").first())
    .not.toHaveClass(/is-reading-position/);
  await expect(returnAction).toBeHidden();
});

test("returns to the marked paragraph on the first click after entering from home", async ({ page }) => {
  const paragraphs = Array.from(
    { length: 90 },
    (_, index) => `Paragraph ${index + 1} contains enough words for reading.\n這是第 ${index + 1} 段翻譯。`,
  ).join("\n\n");
  await createMaterial(page, materialTitle, paragraphs);
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const readingParagraphs = page.locator("[data-reading-paragraph]");
  const markedParagraph = readingParagraphs.nth(52);
  const markedButton = markedParagraph.getByRole("button", { name: "標記目前閱讀段落" });
  await markedButton.scrollIntoViewIfNeeded();
  await markedButton.click();
  await expect(markedButton).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("link", { name: "回到英文學習庫首頁" }).click();
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.getByRole("button", { name: "回到閱讀位置" }).click();

  await expect(markedParagraph).toBeInViewport();
  await expect(markedButton).toBeFocused();
  await expect(markedButton).toHaveClass(/is-active/);
});

test("centers the marked paragraph on the first click immediately after reloading", async ({ page }) => {
  const paragraphs = Array.from(
    { length: 90 },
    (_, index) => `Paragraph ${index + 1} contains enough words for reading.\n這是第 ${index + 1} 段翻譯。`,
  ).join("\n\n");
  await createMaterial(page, materialTitle, paragraphs);
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const markedParagraph = page.locator("[data-reading-paragraph]").nth(52);
  const markedButton = markedParagraph.getByRole("button", { name: "標記目前閱讀段落" });
  await markedButton.scrollIntoViewIfNeeded();
  await markedButton.click();
  await expect(markedButton).toHaveAttribute("aria-pressed", "true");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.reload();
  await page.getByRole("button", { name: "回到閱讀位置" }).click();

  await expect.poll(async () => markedParagraph.evaluate((paragraph) => {
    const bounds = paragraph.getBoundingClientRect();
    return Math.abs((bounds.top + bounds.bottom) / 2 - window.innerHeight / 2);
  })).toBeLessThan(80);
  await expect(markedButton).toBeFocused();
});

test("ignores an orphaned reading position stored in IndexedDB", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.waitForURL(/#\/materials\/[^/]+$/);
  const materialId = /#\/materials\/([^/]+)$/.exec(page.url())?.[1];
  if (!materialId) throw new Error("material id not found");
  await page.evaluate(async (storedMaterialId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction("materials", "readwrite");
    const store = transaction.objectStore("materials");
    const material = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = store.get(storedMaterialId);
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    store.put({ ...material, readingParagraphKey: "99-99-99" });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
    });
    database.close();
  }, materialId);

  await page.reload();
  await expect(page.getByRole("button", { name: "回到閱讀位置" })).toBeHidden();
  await expect(page.getByRole("button", { name: "標記目前閱讀段落" }).first())
    .toHaveAttribute("aria-pressed", "false");
});
