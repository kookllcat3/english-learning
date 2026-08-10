import { expect, test } from "@playwright/test";

import {
  createMaterial,
  materialTitle,
  storedCurrentMaterialKnownWords,
  storedCurrentMaterialReadingParagraphKey,
} from "./test-helpers";

const anchorOptionName = "將閱讀書籤設在此段";

function selectedAnchor(paragraph: import("@playwright/test").Locator) {
  return paragraph.locator(".reading-anchor__button.is-selected");
}

async function setReadingAnchor(
  page: import("@playwright/test").Page,
  paragraphIndex = 0,
): Promise<import("@playwright/test").Locator> {
  const paragraph = page.locator("[data-reading-paragraph]").nth(paragraphIndex);
  await paragraph.getByRole("button", { name: anchorOptionName }).click();
  return selectedAnchor(paragraph);
}

test("uses one toolbar for translations, copy, and paragraph bookmark controls", async ({ page }) => {
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
  const toolbar = page.getByRole("toolbar", { name: "教材閱讀工具" });
  await expect(toolbar).toHaveCount(1);
  expect(await toolbar.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label")))).toEqual([
    "回到閱讀書籤",
    "隱藏全部中文翻譯",
    "複製英文段落",
    "螢光筆",
  ]);
  expect(await toolbar.getByRole("button").evaluateAll((buttons) =>
    new Set(buttons.map((button) => getComputedStyle(button).color)).size)).toBe(1);

  const translationToggle = toolbar.getByRole("button", { name: "隱藏全部中文翻譯" });
  const translations = page.locator(".reading-line-wrap.is-translation .reading-line");
  await expect(translations).toHaveCount(3);
  await translationToggle.click();
  await expect(toolbar.getByRole("button", { name: "顯示全部中文翻譯" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(translations).toHaveClass([
    /translation-mask/,
    /translation-mask/,
    /translation-mask/,
  ]);
  await toolbar.getByRole("button", { name: "顯示全部中文翻譯" }).click();
  await expect(translations).toHaveClass(["reading-line", "reading-line", "reading-line"]);

  const copyButton = toolbar.getByRole("button", { name: "複製英文段落" });
  await copyButton.focus();
  await page.keyboard.press("Enter");
  await expect(copyButton).toHaveAttribute("aria-pressed", "true");
  await paragraphs.nth(0).locator(".reading-word").first().click();
  const copySnackbar = page.locator(".reading-snackbar");
  await expect(toolbar.getByRole("status")).toHaveCount(0);
  await expect(copySnackbar).toHaveText("英文段落已複製");
  await expect(copySnackbar).toBeInViewport();
  expect(await page.evaluate(() =>
    (window as unknown as { copiedParagraph?: string }).copiedParagraph)).toBe("A bear runs.");
  await expect(copyButton).toHaveAttribute("aria-pressed", "false");

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => Promise.reject(new Error("clipboard denied")) },
    });
  });
  await toolbar.getByRole("button", { name: "複製英文段落" }).click();
  await expect(copyButton).toHaveAttribute("aria-pressed", "true");
  await paragraphs.nth(1).locator(".reading-word").first().dispatchEvent("click");
  await expect(copySnackbar).toHaveAttribute("role", "alert");
  await expect(copySnackbar).toHaveText("複製失敗，請再試一次");
  await expect(copySnackbar).toHaveCount(0, { timeout: 4000 });

  const anchorTool = toolbar.getByRole("button", { name: "回到閱讀書籤" });
  const highlightButton = toolbar.getByRole("button", { name: "螢光筆" });
  await expect(anchorTool).toBeDisabled();
  await expect(toolbar).not.toContainText("選擇英文段落");
  await expect(page.getByRole("button", { name: anchorOptionName })).toHaveCount(3);

  await copyButton.click();
  await expect(copyButton).toHaveAttribute("aria-pressed", "true");
  await translationToggle.click();
  await expect(copyButton).toHaveAttribute("aria-pressed", "false");
  await expect(toolbar.getByRole("button", { name: "顯示全部中文翻譯" }))
    .toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("button", { name: "顯示全部中文翻譯" }).click();

  await copyButton.click();
  await expect(copyButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: anchorOptionName })).toHaveCount(3);
  await highlightButton.click();
  await expect(highlightButton).toHaveAttribute("aria-pressed", "true");
  await expect(copyButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: anchorOptionName })).toHaveCount(3);
  const firstBookmarkButton = paragraphs.nth(0).getByRole("button", { name: anchorOptionName });
  await expect.poll(async () => {
    const bookmarkIconBox = await firstBookmarkButton.locator("svg").boundingBox();
    const sourceTextTop = await paragraphs.nth(0).locator(".reading-line-wrap").first()
      .evaluate((line) => {
        const range = document.createRange();
        range.selectNodeContents(line);
        return range.getBoundingClientRect().top;
      });
    return bookmarkIconBox ? Math.abs(bookmarkIconBox.y - sourceTextTop - 4) : 999;
  }).toBeLessThan(1.5);
  const bookmarkButtons = page.locator(".reading-anchor__button");
  await bookmarkButtons.evaluateAll((buttons) => {
    buttons.forEach((button) => button.setAttribute("disabled", ""));
  });
  await expect.poll(async () => bookmarkButtons.evaluateAll((buttons) => [
    ...new Set(buttons.map((button) => getComputedStyle(button).opacity)),
  ])).toEqual(["1"]);
  await bookmarkButtons.evaluateAll((buttons) => {
    buttons.forEach((button) => button.removeAttribute("disabled"));
  });
  const sourceLine = paragraphs.nth(0).locator(".reading-line-wrap").first();
  const translationLine = paragraphs.nth(0).locator(".reading-line-wrap.is-translation").first();
  await expect.poll(async () => {
    const sourceBox = await sourceLine.boundingBox();
    const translationBox = await translationLine.boundingBox();
    return sourceBox && translationBox ? Math.abs(sourceBox.x - translationBox.x) : 999;
  }).toBeLessThan(1);
  await paragraphs.nth(0).getByRole("button", { name: anchorOptionName }).click();
  await expect(highlightButton).toHaveAttribute("aria-pressed", "false");
  const anchor = selectedAnchor(paragraphs.nth(0));
  await expect(anchor).toHaveCount(1);
  await expect(anchorTool).toBeEnabled();
  await expect(anchorTool).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => storedCurrentMaterialKnownWords(page))
    .toEqual(["a", "bear", "runs"]);

  await copyButton.click();
  await expect(copyButton).toHaveAttribute("aria-pressed", "true");
  await paragraphs.nth(1).getByRole("button", { name: anchorOptionName }).click();
  await expect(copyButton).toHaveAttribute("aria-pressed", "false");
  await expect(selectedAnchor(paragraphs.nth(1))).toHaveCount(1);
  await expect(page.getByRole("button", { name: anchorOptionName })).toHaveCount(2);
  await expect.poll(() => storedCurrentMaterialKnownWords(page))
    .toEqual(["a", "bear", "fox", "runs", "sleeps", "the"]);

  const secondParagraphKey = await paragraphs.nth(1).getAttribute("data-paragraph-key");
  await expect.poll(() => storedCurrentMaterialReadingParagraphKey(page))
    .toBe(secondParagraphKey);
  await page.reload();
  const restoredAnchor = selectedAnchor(paragraphs.nth(1));
  await expect(restoredAnchor).toHaveCount(1);
  await expect(page.locator(".reading-anchor__button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: anchorOptionName })).toHaveCount(2);
  await restoredAnchor.click();
  await expect(restoredAnchor).toHaveCount(0);
  await expect(page.locator(".reading-anchor__button")).toHaveCount(3);
  await expect(anchorTool).toBeDisabled();
  await expect(anchorTool).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => storedCurrentMaterialReadingParagraphKey(page)).toBeNull();
  await expect(storedCurrentMaterialKnownWords(page))
    .resolves.toEqual(["a", "bear", "fox", "runs", "sleeps", "the"]);
});

test("marks every word in the material as known from the footer action", async ({ page }) => {
  await createMaterial(
    page,
    materialTitle,
    "A bear runs.\n熊跑了。\n\nThe fox sleeps.\n狐狸睡著了。",
  );
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const firstMarker = await setReadingAnchor(page);
  await expect(firstMarker).toBeVisible();
  await expect.poll(() => storedCurrentMaterialKnownWords(page))
    .toEqual(["a", "bear", "runs"]);

  await expect(page.getByText("完成這篇教材", { exact: true })).toHaveCount(0);
  await expect(page.getByText("將這篇教材的全部英文單字標記為認識，並更新學習進度。", { exact: true })).toHaveCount(0);
  const completionButton = page.getByRole("button", { name: "完成本次學習" });
  await completionButton.scrollIntoViewIfNeeded();
  await completionButton.click();

  const completedButton = page.getByRole("button", { name: "本篇單字已全部認識" });
  await expect(completedButton).toBeDisabled();
  await expect(completedButton).toHaveCSS("cursor", "not-allowed");
  await expect(page.getByText("已將本篇全部單字標記為認識。", { exact: true })).toHaveCount(0);
  await expect.poll(() => storedCurrentMaterialKnownWords(page))
    .toEqual(["a", "bear", "fox", "runs", "sleeps", "the"]);
  await expect(firstMarker).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "本篇單字已全部認識" })).toBeDisabled();
  await expect(selectedAnchor(page.locator("[data-reading-paragraph]").first())).toBeVisible();
  await expect(storedCurrentMaterialKnownWords(page))
    .resolves.toEqual(["a", "bear", "fox", "runs", "sleeps", "the"]);
});

test("rolls back reading position and words when the progress transaction fails", async ({ page }) => {
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(value, key) {
      if (
        sessionStorage.getItem("simulateProgressFailure") === "true"
        && this.name === "vocabulary"
      ) {
        throw new DOMException("Simulated progress failure", "QuotaExceededError");
      }
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
    };
  });
  await createMaterial(page, materialTitle, "A bear runs.\n熊跑了。\n\nThe fox sleeps.\n狐狸睡著了。");
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.waitForURL(/#\/materials\/[^/]+$/);
  await page.evaluate(() => sessionStorage.setItem("simulateProgressFailure", "true"));

  await page.locator("[data-reading-paragraph]").first()
    .getByRole("button", { name: anchorOptionName }).click();

  await expect(page.getByRole("alert")).toContainText("學習進度更新失敗");
  await expect(page.getByRole("button", { name: "回到閱讀書籤" })).toBeDisabled();
  await expect(storedCurrentMaterialKnownWords(page)).resolves.toEqual([]);
  const storedReadingParagraphKey = await page.evaluate(async () => {
    const materialId = location.hash.match(/^#\/materials\/([^/?]+)/)?.[1];
    if (!materialId) throw new Error("Material route was not active.");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const request = database.transaction("materials", "readonly")
      .objectStore("materials").get(materialId);
    const record = await new Promise<{ readingParagraphKey?: string | null }>((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    database.close();
    return record.readingParagraphKey ?? null;
  });
  expect(storedReadingParagraphKey).toBeNull();
});

test("keeps paragraph and footer progress actions mutually exclusive", async ({ page }) => {
  await createMaterial(page, materialTitle, "A bear runs.\n熊跑了。\n\nThe fox sleeps.\n狐狸睡著了。");
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.waitForURL(/#\/materials\/[^/]+$/);
  await page.evaluate(async () => {
    const materialId = location.hash.match(/^#\/materials\/([^/?]+)/)?.[1];
    if (!materialId) throw new Error("Material route was not active.");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(["materials", "vocabulary"], "readwrite");
    const store = transaction.objectStore("materials");
    const releaseAt = performance.now() + 1000;
    const keepAlive = (): void => {
      const request = store.get(materialId);
      request.addEventListener("success", () => {
        if (performance.now() < releaseAt) keepAlive();
      }, { once: true });
    };
    keepAlive();
    transaction.addEventListener("complete", () => database.close(), { once: true });
  });

  const completionButton = page.getByRole("button", { name: "完成本次學習" });
  await page.locator("[data-reading-paragraph]").first()
    .getByRole("button", { name: anchorOptionName }).click();

  await expect(page.getByRole("button", { name: /閱讀書籤/ }).first()).toBeDisabled();
  await expect(completionButton).toBeDisabled();
  await completionButton.click({ force: true });
  await expect(selectedAnchor(page.locator("[data-reading-paragraph]").first())).toBeVisible();
  await expect.poll(() => storedCurrentMaterialKnownWords(page))
    .toEqual(["a", "bear", "runs"]);
});

test("synchronizes reading position and known words across tabs", async ({ context, page }) => {
  await createMaterial(page, materialTitle, "A bear runs.\n熊跑了。\n\nThe fox sleeps.\n狐狸睡著了。");
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.waitForURL(/#\/materials\/[^/]+$/);
  const secondPage = await context.newPage();
  await secondPage.goto(page.url());
  await expect(secondPage.getByRole("button", { name: "回到閱讀書籤" }))
    .toHaveAttribute("aria-pressed", "false");

  const firstPageMarker = await setReadingAnchor(page);

  await expect(firstPageMarker).toBeVisible();
  await expect(selectedAnchor(secondPage.locator("[data-reading-paragraph]").first())).toBeVisible();
  await expect.poll(() => storedCurrentMaterialKnownWords(secondPage))
    .toEqual(["a", "bear", "runs"]);
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
      ["materials", "materialContents", "materialTerms", "vocabulary", "materialAnnotations", "settings"],
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
    transaction.objectStore("materialAnnotations").put({
      id: `${encodeURIComponent(materialId)}::${encodeURIComponent("vocabulary:birds")}`,
      materialId,
      kind: "legacy-contextual-word-note",
      target: {
        type: "contextual-word-occurrence",
        occurrenceKey: "vocabulary:birds",
        word: "birds",
      },
      body: { format: "markdown", value: "keep this note" },
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
  await expect(page.getByRole("toolbar", { name: "教材閱讀工具" })).toHaveCount(1);
  await expect(page.locator(".reading-line-wrap.is-translation")).toHaveCount(1);
  await expect(page.locator('[data-word="birds"]')).toHaveCount(1);
  await expect(page.locator('[data-word="en"]')).toHaveCount(0);
  await expect(page.locator('[data-word="avian"]')).toHaveCount(0);
  const readingToolbar = page.getByRole("toolbar", { name: "教材閱讀工具" });
  await expect(readingToolbar).toHaveClass(/reading-toolbar/);
  await expect(readingToolbar.getByRole("button")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /編輯這段中文解釋/ })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /編輯這段中文解釋/ })).toHaveCount(0);
  await readingToolbar.getByRole("button", { name: "隱藏全部中文翻譯" }).click();
  await expect(page.locator(".reading-line-wrap.is-translation .reading-line"))
    .toHaveClass(/translation-mask/);
  await expect(page.getByRole("button", { name: "回到閱讀書籤" })).toBeDisabled();

  const migrated = await page.evaluate(async (materialId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(
      ["materials", "materialTerms", "vocabulary", "materialAnnotations", "settings"],
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
      read<{ body: { value: string } }>(
        "materialAnnotations",
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
      note: { markdown: note.body.value },
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

test("keeps the single toolbar available and returns to a reading anchor", async ({ page }) => {
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
  await lastParagraph.getByRole("button", { name: anchorOptionName }).click();
  const lastMarker = selectedAnchor(lastParagraph);
  const returnAction = page.getByRole("button", { name: "回到閱讀書籤" });

  await expect(lastMarker).toBeVisible();
  await expect(lastParagraph.locator(".reading-line-wrap").first())
    .toHaveClass(/is-reading-position/);
  await expect(lastParagraph.locator(".reading-line-wrap.is-translation"))
    .not.toHaveClass(/is-reading-position/);
  await expect(returnAction).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "教材閱讀工具" })).toHaveCSS("position", "sticky");
  await expect(page.locator(".material-view-switcher")).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(lastMarker).not.toBeInViewport();
  await expect(returnAction).toBeVisible();
  await returnAction.focus();
  await page.keyboard.press("Enter");
  await expect(returnAction).toBeVisible();
  await expect(lastMarker).toBeFocused();
  await expect(lastParagraph).toBeInViewport();

  await page.keyboard.press("Enter");
  await expect(lastMarker).toHaveCount(0);
  await expect(lastParagraph.locator(".reading-line-wrap").first())
    .not.toHaveClass(/is-reading-position/);
  await expect(page.getByRole("button", { name: "回到閱讀書籤" })).toBeDisabled();
});

test("switches and removes a reading bookmark from paragraph gutter buttons", async ({ page }) => {
  await createMaterial(
    page,
    materialTitle,
    [
      "First paragraph has several words.\n第一段翻譯。",
      "Second paragraph has several words.\n第二段翻譯。",
      "Third paragraph has several words.\n第三段翻譯。",
    ].join("\n\n"),
  );
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const paragraphs = page.locator("[data-reading-paragraph]");
  const firstParagraph = paragraphs.nth(0);
  const secondParagraph = paragraphs.nth(1);
  await expect(page.getByRole("button", { name: anchorOptionName })).toHaveCount(3);
  await firstParagraph.getByRole("button", { name: anchorOptionName }).click();

  const firstAnchor = selectedAnchor(firstParagraph);
  await expect(firstAnchor).toBeVisible();
  await secondParagraph.getByRole("button", { name: anchorOptionName }).click();

  const secondAnchor = selectedAnchor(secondParagraph);
  await expect(firstAnchor).toHaveCount(0);
  await expect(secondAnchor).toBeVisible();
  await expect(secondParagraph.locator(".reading-line-wrap").first())
    .toHaveClass(/is-reading-position/);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await secondAnchor.click();
  await expect(secondAnchor).toHaveCount(0);
  await expect(page.getByRole("button", { name: anchorOptionName })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "回到閱讀書籤" })).toBeDisabled();
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
  await markedParagraph.getByRole("button", { name: anchorOptionName }).click();
  const markedButton = selectedAnchor(markedParagraph);
  await expect(markedButton).toBeVisible();

  await page.getByRole("link", { name: "回到英文學習庫首頁" }).click();
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(readingParagraphs.locator(".reading-anchor__button")).toHaveCount(90);
  await page.getByRole("button", { name: "回到閱讀書籤" }).click();

  await expect(markedParagraph).toBeInViewport();
  await expect(markedButton).toBeFocused();
  await expect(markedButton).toBeVisible();
});

test("centers the marked paragraph on the first click immediately after reloading", async ({ page }) => {
  const paragraphs = Array.from(
    { length: 90 },
    (_, index) => `Paragraph ${index + 1} contains enough words for reading.\n這是第 ${index + 1} 段翻譯。`,
  ).join("\n\n");
  await createMaterial(page, materialTitle, paragraphs);
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const markedParagraph = page.locator("[data-reading-paragraph]").nth(52);
  await markedParagraph.getByRole("button", { name: anchorOptionName }).click();
  const markedButton = selectedAnchor(markedParagraph);
  await expect(markedButton).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.reload();
  await expect(page.locator("[data-reading-paragraph] .reading-anchor__button")).toHaveCount(90);
  await page.getByRole("button", { name: "回到閱讀書籤" }).click();

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
  await expect(page.getByRole("button", { name: "回到閱讀書籤" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "回到閱讀書籤" }))
    .toHaveAttribute("aria-pressed", "false");
});
