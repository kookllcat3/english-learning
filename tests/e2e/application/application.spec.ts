import { expect, test, type Page } from "@playwright/test";

const materialTitle = "Playwright 動物短文";
const materialContent = "A bear runs. The bear sleeps.";
const validWebpBase64 = "UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoBAAEAAUAmJaACdLoB+AAEgwAA/vS+7/56ZrzB/k5/8pV4LG5vgAAA";

function alphabeticWord(index: number): string {
  let value = index;
  let word = "";
  do {
    word = String.fromCharCode(97 + (value % 26)) + word;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return `word${word}`;
}

async function createMaterial(
  page: Page,
  title = materialTitle,
  content = materialContent,
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "新增素材" }).click();
  await page.getByLabel("素材名稱（選填）").fill(title);
  await page.getByLabel("直接貼上文字").fill(content);
  await page.getByRole("button", { name: "儲存素材" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test("uses one Vue app and persists learning progress through routed views", async ({ page }) => {
  await createMaterial(page);

  await expect(page.locator("#app")).toHaveCount(1);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page).toHaveURL(/#\/materials\/.+/);
  await expect(page.getByRole("heading", { name: materialTitle, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "素材詞彙" }).click();

  const bearCheckbox = page.getByRole("checkbox", { name: /bear/ });
  await bearCheckbox.check();
  await expect(page.getByText(/已認識\s+1\s+\/\s+5\s+個/)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "素材詞彙" }).click();
  await expect(page.getByRole("checkbox", { name: /bear/ })).toBeChecked();
  await expect(page.getByText(/已認識\s+1\s+\/\s+5\s+個/)).toBeVisible();

  await page.getByRole("link", { name: "回到英文學習庫首頁" }).click();
  await expect(page).toHaveURL(/#\/?$/);
  const knownWordMetric = page.getByRole("article").filter({ hasText: "已認識詞彙" });
  await expect(knownWordMetric.getByRole("strong")).toHaveText("1");
});

test("shows global familiarity in an unread material", async ({ page }) => {
  const learnedMaterialTitle = "Familiarity source";
  const unreadMaterialTitle = "Unread material";
  await createMaterial(page, learnedMaterialTitle, "A bear sleeps.");

  const learnedMaterialCard = page.getByRole("article").filter({ hasText: learnedMaterialTitle });
  await learnedMaterialCard.getByRole("link", { name: "開始閱讀" }).click();
  await page.getByRole("button", { name: "素材詞彙" }).click();
  await page.getByRole("checkbox", { name: /bear/ }).check();
  await expect(page.locator('[data-word="bear"]').first()).toHaveClass(/known-word/);

  await createMaterial(page, unreadMaterialTitle, "The bear wakes.");
  const unreadMaterialCard = page.getByRole("article").filter({ hasText: unreadMaterialTitle });
  await unreadMaterialCard.getByRole("link", { name: "開始閱讀" }).click();

  const unreadBear = page.locator('[data-word="bear"]').first();
  await expect(unreadBear).toHaveClass(/known-word/);
  await expect(unreadBear.locator(".known-word__glyph")).toHaveCount(4);
});

test("persists a word note without showing formatting controls", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();

  await page.locator('[data-word="bear"]').first().hover();
  const wordHeading = page.getByRole("heading", { name: "bear", level: 2 });
  await expect(wordHeading).toBeVisible();
  await expect(wordHeading.locator("a")).toHaveCount(0);
  await expect(wordHeading).not.toHaveCSS("user-select", "none");
  const leftHeaderActions = page.locator(".word-card__word").getByRole("button");
  await expect(leftHeaderActions.nth(0)).toHaveAccessibleName("播放單字發音");
  await expect(leftHeaderActions.nth(1)).toHaveAccessibleName("標記為已認識");
  const rightHeaderActions = page.locator(".word-card__actions").getByRole("button");
  await expect(rightHeaderActions.nth(0)).toHaveAccessibleName("釘選單字卡");
  await expect(rightHeaderActions).toHaveCount(1);
  await leftHeaderActions.nth(1).click();
  await expect(leftHeaderActions.nth(1)).toHaveAccessibleName("標記為不認識");
  await expect(leftHeaderActions.nth(1)).toHaveClass(/is-active/);
  for (const control of await page.locator(".word-card__heading button").all()) {
    await expect(control).toHaveCSS("height", "36px");
  }
  for (const control of await page.locator(".word-card__heading .icon-button").all()) {
    await expect(control).toHaveCSS("display", "grid");
    await expect(control).toHaveCSS("place-items", "center");
  }
  await expect(page.getByRole("button", { name: "關閉單字卡" })).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Markdown 格式工具列" })).toHaveCount(0);
  const editor = page.getByLabel("單字 Markdown 筆記");
  await expect(editor).toHaveCSS("resize", "none");
  await expect(editor).toHaveCSS("overflow-y", "auto");
  await editor.click();
  await expect(page.getByRole("button", { name: "釘選單字卡" })).toHaveAttribute("aria-pressed", "false");
  await page.locator('[data-word="runs"]').first().hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  await editor.fill("large animal");
  await expect(page.getByRole("status")).toHaveText("已儲存");

  await page.reload();
  await page.locator('[data-word="bear"]').first().hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  await expect(page.getByLabel("單字 Markdown 筆記")).toContainText("large animal");
});

test("keeps a word note draft visible when IndexedDB persistence fails", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.locator('[data-word="bear"]').first().hover();

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    const state = window as typeof window & { restoreWordNotePut?: () => void };
    state.restoreWordNotePut = () => {
      IDBObjectStore.prototype.put = originalPut;
    };
    IDBObjectStore.prototype.put = function put(value, key) {
      if (this.name === "wordNotes") throw new DOMException("Simulated write failure", "UnknownError");
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
    };
  });

  const editor = page.getByLabel("單字 Markdown 筆記");
  await editor.fill("recover this note");
  await expect(page.getByRole("status")).toContainText("草稿仍保留在此分頁");
  await page.locator('[data-word="runs"]').first().hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  await expect(editor).toContainText("recover this note");

  await page.evaluate(() => {
    const state = window as typeof window & { restoreWordNotePut?: () => void };
    state.restoreWordNotePut?.();
  });
  await editor.fill("recover this note safely");
  await page.waitForTimeout(800);
  await page.reload();
  await page.locator('[data-word="bear"]').first().hover();
  await expect(page.getByLabel("單字 Markdown 筆記")).toContainText("recover this note safely");
});

test("keeps the word card open while a pointer interaction is active", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  const bearWord = page.locator('[data-word="bear"]').first();
  const bearHeading = page.getByRole("heading", { name: "bear", level: 2 });
  await bearWord.hover();
  await expect(bearHeading).toBeHidden();
  await page.waitForTimeout(1050);
  await expect(bearHeading).toBeVisible();
  await page.locator('[data-word="runs"]').first().hover();
  await expect(page.getByRole("heading", { name: "runs", level: 2 })).toBeVisible();

  const card = page.locator(".word-card");
  const editor = page.getByLabel("單字 Markdown 筆記");
  await editor.dispatchEvent("pointerdown", { button: 0, pointerId: 91 });
  await card.dispatchEvent("pointerleave", { pointerId: 91 });
  await expect(page.getByRole("heading", { name: "runs", level: 2 })).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 91 }));
  });
});

test("locks page scrolling while the word card is open", async ({ page }) => {
  const longContent = Array.from({ length: 40 }, () => materialContent).join("\n");
  await createMaterial(page, "Word card scroll lock", longContent);
  await page.locator(".material-card .button--primary").first().click();

  const wordHeading = page.getByRole("heading", { name: "bear", level: 2 });
  await page.locator('[data-word="bear"]').first().hover();
  await expect(wordHeading).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));

  const readingPosition = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(readingPosition);
  await page.keyboard.press("PageDown");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(readingPosition);

  await page.locator("h1").click();
  await expect(wordHeading).toBeHidden();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(readingPosition);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator(".material-view-switcher__button").nth(1).click();
  await page.locator(".word-item__lookup").first().click();
  await expect(page.locator(".word-card h2")).toBeVisible();
  const vocabularyPosition = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(vocabularyPosition);
});

test("locks page scrolling behind a native dialog and restores the reading position", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".material-grid")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(() => {
    document.body.style.minHeight = "2400px";
  });
  await expect.poll(() => page.evaluate(() => {
    window.scrollTo(0, 400);
    return window.scrollY;
  })).toBe(400);

  await page.getByRole("button", { name: "開啟資料管理" }).dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "資料管理" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("fixed");
  await expect.poll(() => page.evaluate(() => document.body.style.top)).toBe("-400px");

  await page.mouse.move(2, 400);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => document.body.style.top)).toBe("-400px");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("");
});

test("pins a word card opened from a text selection", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.locator('[data-word="bear"]').first()).toBeVisible();
  await page.evaluate(() => {
    const word = document.querySelector<HTMLElement>('[data-word="bear"]');
    if (!word) throw new Error("word not found");
    const range = document.createRange();
    range.selectNodeContents(word);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });

  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: "取消釘選單字卡" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("heading", { name: "bear", level: 2 }).click();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
});

test("keeps translation text selectable while preserving its blur control", async ({ page }) => {
  const title = "Translation selection";
  await createMaterial(page, title, "An original sentence.\n中文翻譯內容。");
  const materialCard = page.getByRole("article").filter({ hasText: title });
  await materialCard.getByRole("link").click();

  const translationLine = page.locator(".reading-line-wrap.is-translation").first();
  const translationText = translationLine.locator(".reading-line");
  const toggle = translationLine.locator(".translation-visibility-toggle");
  const textBounds = await translationText.boundingBox();
  if (!textBounds) throw new Error("translation line is not visible");

  const selectionY = textBounds.y + (textBounds.height / 2);
  await expect(toggle).toHaveCSS("pointer-events", "auto");

  await page.mouse.move(textBounds.x + 2, selectionY);
  await page.mouse.down();
  await page.mouse.move(textBounds.x + textBounds.width - 2, selectionY, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toContain("中文翻譯內容");
  await expect(toggle).toHaveCSS("pointer-events", "auto");

  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await toggle.click();
  await expect(translationText).toHaveClass(/translation-mask/);
});

test("pins the word card when its word is selected", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  const word = page.locator('[data-word="bear"]').first();
  await word.hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  await page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>(".word-card__heading h2");
    if (!heading) throw new Error("word card heading not found");
    const range = document.createRange();
    range.selectNodeContents(heading);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });

  await expect(page.getByRole("button", { name: "取消釘選單字卡" })).toHaveAttribute("aria-pressed", "true");
});

test("marks paragraph words and keeps one reading position", async ({ page }) => {
  await createMaterial(
    page,
    materialTitle,
    "A bear runs.\n中文翻譯。\n\nThe fox sleeps.\n另一段翻譯。",
  );
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const paragraphs = page.locator("[data-reading-paragraph]");
  await expect(paragraphs).toHaveCount(2);
  await expect(page.getByRole("button", { name: "將本段單字標記為認識" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "標記目前閱讀段落" })).toHaveCount(2);

  await paragraphs.nth(0).getByRole("button", { name: "將本段單字標記為認識" }).click();
  await expect(page.locator('[data-word="bear"]').first()).toHaveClass(/known-word/);
  await expect(page.locator('[data-word="fox"]').first()).not.toHaveClass(/known-word/);

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
  await expect(page.getByRole("heading", { name: "還沒有學習素材" })).toBeVisible();
  await page.evaluate(async ({ blocks: storedBlocks, content: storedContent, id: materialId, timestamp: storedTimestamp }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(
      ["materials", "materialContents", "materialTerms", "vocabulary", "wordNotes", "settings"],
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
    transaction.objectStore("wordNotes").put({
      word: "avian",
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
  await expect(page.getByRole("button", { name: "將本段單字標記為認識" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "標記目前閱讀段落" })).toHaveCount(1);
  await expect(page.locator(".reading-line-wrap.is-translation")).toHaveCount(1);
  await expect(page.locator('[data-word="birds"]')).toHaveCount(1);
  await expect(page.locator('[data-word="en"]')).toHaveCount(0);
  await expect(page.locator('[data-word="avian"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "回到閱讀位置" })).toBeHidden();

  const migrated = await page.evaluate(async (materialId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("english-learning");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(
      ["materials", "materialTerms", "vocabulary", "wordNotes", "settings"],
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
      read<{ markdown: string }>("wordNotes", "avian"),
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
  expect(await returnAction.evaluate((button) => Boolean(button.closest(".panel__heading")))).toBe(true);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(lastMarker).not.toBeInViewport();
  await expect(returnAction).toBeVisible();
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

test("unpins a pinned word card before its natural outside close", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.locator('[data-word="bear"]').first().hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();

  await page.getByRole("button", { name: "釘選單字卡" }).click();
  await page.getByRole("heading", { name: materialTitle, level: 1 }).dispatchEvent("pointerdown", {
    button: 0,
    pointerId: 91,
    pointerType: "mouse",
  });
  await expect(page.getByRole("button", { name: "釘選單字卡" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeHidden();

  await page.getByRole("heading", { name: materialTitle, level: 1 }).hover();
  await page.locator('[data-word="bear"]').first().hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: "釘選單字卡" })).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "釘選單字卡" }).click();
  await page.getByRole("heading", { name: materialTitle, level: 1 }).dispatchEvent("pointerdown", {
    button: 0,
    pointerId: 92,
    pointerType: "touch",
  });
  await expect(page.getByRole("button", { name: "釘選單字卡" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeHidden();

  await page.getByRole("heading", { name: materialTitle, level: 1 }).hover();
  await page.locator('[data-word="bear"]').first().hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  const pinButton = page.locator(".word-card__actions .icon-button");
  await pinButton.click();
  const nextWord = page.locator('.reading-word:not([data-word="bear"])').first();
  const nextWordText = await nextWord.getAttribute("data-word");
  if (!nextWordText) throw new Error("next reading word not found");
  await nextWord.click();
  await page.waitForTimeout(200);
  await expect(page.getByRole("heading", { name: nextWordText, level: 2 })).toBeVisible();
  await expect(pinButton).toHaveAttribute("aria-pressed", "false");
});

test("keeps an edited AI prompt when focus leaves the editor", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.getByRole("button", { name: "開啟 AI 輔助學習" }).click();

  const promptEditor = page.getByLabel("可編輯提示詞");
  await promptEditor.fill("我的自訂提示詞");
  await page.getByRole("heading", { name: "啟用 AI 學習" }).click();
  await expect(promptEditor).toHaveValue("我的自訂提示詞");
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("button", { name: "開啟 AI 輔助學習" }).click();
  await expect(page.getByLabel("可編輯提示詞")).toHaveValue("我的自訂提示詞");
});

test("keeps the legacy material URL compatible", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page).toHaveURL(/#\/materials\/.+/);
  const materialId = new URL(page.url()).hash.split("/").at(-1);

  await page.goto(`/material.html?id=${encodeURIComponent(materialId ?? "")}`);

  await expect(page).toHaveURL(new RegExp(`#\\/materials\\/${materialId}$`));
  await expect(page.getByRole("heading", { name: materialTitle, level: 1 })).toBeVisible();
});

test("exports, removes, and restores a complete backup", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.getByRole("button", { name: "標記目前閱讀段落" }).first().click();
  await page.getByRole("button", { name: "開啟 AI 輔助學習" }).click();
  await page.getByLabel("可編輯提示詞").fill("備份中的自訂 AI 提示詞");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("link", { name: "回到英文學習庫首頁" }).click();

  await page.getByRole("button", { name: "開啟資料管理" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下載備份" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();
  await expect(page.getByRole("status")).toContainText("備份已下載");
  await page.getByRole("button", { name: "關閉", exact: true }).click();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("article")
    .filter({ hasText: materialTitle })
    .getByRole("button", { name: "移除" })
    .click();
  await expect(page.getByRole("heading", { name: materialTitle })).toHaveCount(0);

  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]')
    .setInputFiles(backupPath as string);

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("備份已匯入");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await expect(page.getByRole("button", { name: "回到閱讀位置" })).toBeVisible();
  await expect(page.getByRole("button", { name: "標記目前閱讀段落" }).first())
    .toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "開啟 AI 輔助學習" }).click();
  await expect(page.getByLabel("可編輯提示詞")).toHaveValue("備份中的自訂 AI 提示詞");
});

test("reports an invalid backup without changing the library", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("button", { name: "開啟資料管理" }).click();

  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "invalid-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from("{invalid json", "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("alert")).toContainText("JSON");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
});

test("skips an unsupported image material and imports the remaining backup", async ({ page }) => {
  const timestamp = "2026-08-02T08:00:00.000Z";
  const supportedMaterialId = "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a27";
  const unsupportedMaterialId = "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a28";
  const supportedImageMaterialId = "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a29";
  await page.goto("/");
  await page.locator('button[aria-label="開啟資料管理"]').click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "mixed-support-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 3,
      materials: [
        {
          id: supportedMaterialId,
          title: "Supported text material",
          description: "",
          content: "A supported sentence.",
          contentBlocks: [{ type: "text", text: "A supported sentence.", order: 0 }],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: unsupportedMaterialId,
          title: "Unsupported image material",
          description: "",
          content: "An image sentence.",
          contentBlocks: [{ type: "image", assetId: "unsupported-asset", order: 0 }],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: supportedImageMaterialId,
          title: "Supported image material",
          description: "",
          content: "An image sentence.",
          contentBlocks: [{
            type: "image",
            assetId: "supported-asset",
            alt: "",
            caption: "",
            order: 0,
          }],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      materialAssets: [
        {
          id: "unsupported-asset",
          materialId: unsupportedMaterialId,
          mimeType: "image/webp",
          width: 1,
          height: 1,
          alt: "",
          caption: "",
          data: "data:image/webp;base64,not-a-webp",
        },
        {
          id: "supported-asset",
          materialId: supportedImageMaterialId,
          mimeType: "image/webp",
          width: 1,
          height: 1,
          alt: "",
          caption: "",
          data: `data:image/webp;base64,${validWebpBase64}`,
        },
      ],
      vocabulary: [],
      wordNotes: [],
      settings: [],
    }), "utf8"),
  });

  const dataDialog = page.locator('.data-management-dialog');
  await expect(dataDialog.locator('[role="status"]')).toContainText("略過不支援素材 1 份");
  await expect(page.getByText("Supported text material")).toBeVisible();
  await expect(page.getByText("Supported image material")).toBeVisible();
  await expect(page.getByText("Unsupported image material")).toHaveCount(0);
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  const supportedCard = page.getByRole("article").filter({ hasText: "Supported image material" });
  await supportedCard.getByRole("link", { name: "開始閱讀" }).click();
  const image = page.locator(".reading-figure img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => {
    const imageElement = element as HTMLImageElement;
    return [imageElement.complete, imageElement.naturalWidth, imageElement.naturalHeight];
  })).toEqual([true, 1, 1]);
});

test("skips a material whose reading position does not exist", async ({ page }) => {
  const timestamp = "2026-08-02T08:00:00.000Z";
  await createMaterial(page);
  await page.getByRole("button", { name: "開啟資料管理" }).click();

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "orphaned-reading-position.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 3,
      exportedAt: timestamp,
      materials: [{
        id: "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a27",
        title: "Invalid reading position",
        description: "",
        content: "Only one paragraph.",
        contentBlocks: [{ type: "text", text: "Only one paragraph.", order: 0 }],
        readingParagraphKey: "0-0-9",
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      vocabulary: [],
      wordNotes: [],
      settings: [],
    }), "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toBeVisible();
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("heading", { name: materialTitle })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invalid reading position" })).toHaveCount(0);
});

test("clears a legacy reading marker that points to a newly classified heading", async ({ page }) => {
  const timestamp = "2026-08-02T08:00:00.000Z";
  await page.goto("/");
  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "legacy-heading-marker.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 3,
      exportedAt: timestamp,
      materials: [{
        id: "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a27",
        title: "Legacy heading marker",
        description: "",
        content: "Meet the Animals\nA lion sleeps.",
        contentBlocks: [
          { type: "text", text: "Meet the Animals", order: 0 },
          { type: "text", text: "A lion sleeps.", order: 1 },
        ],
        knownWords: [],
        readingParagraphKey: "0-0-0",
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      vocabulary: [],
      wordNotes: [],
      settings: [],
    }), "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("備份已匯入");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("article")
    .filter({ hasText: "Legacy heading marker" })
    .getByRole("link", { name: "開始閱讀" })
    .click();

  await expect(page.locator("[data-reading-paragraph]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "回到閱讀位置" })).toBeHidden();
  await expect(page.getByRole("button", { name: "標記目前閱讀段落" }))
    .toHaveAttribute("aria-pressed", "false");
});

test("imports a schema version 1 backup with legacy learning progress", async ({ page }) => {
  const timestamp = "2026-01-02T03:04:05.000Z";
  const legacyBackup = {
    schemaVersion: 1,
    materials: [{
      id: "7e4fafc8-9533-4a3e-bfb6-69fe4cc88a27",
      title: "舊版備份素材",
      description: "",
      content: "Animal",
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    vocabulary: [{
      word: "animal",
      learned: true,
      learnedAt: timestamp,
      updatedAt: timestamp,
    }],
  };

  await page.goto("/");
  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "legacy-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacyBackup), "utf8"),
  });

  const dataDialog = page.getByRole("dialog", { name: "資料管理" });
  await expect(dataDialog.getByRole("status")).toContainText("備份已匯入");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  const legacyCard = page.getByRole("article").filter({ hasText: "舊版備份素材" });
  await expect(legacyCard).toContainText("1 / 1");
});

test("keeps the viewport stable while sorting materials", async ({ page }) => {
  const timestamp = "2026-01-02T03:04:05.000Z";
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
  const knownWords = [[], ["delta"], ["zeta", "eta"], ["theta", "iota"]];
  const materials = titles.map((title, index) => ({
    id: `7e4fafc8-9533-4a3e-bfb6-69fe4cc88a${String(index).padStart(2, "0")}`,
    title,
    description: "",
    content: contents[index],
    knownWords: knownWords[index],
    createdAt: new Date(Date.parse(timestamp) + index * 1_000).toISOString(),
    updatedAt: new Date(Date.parse(timestamp) + index * 1_000).toISOString(),
  }));

  await page.goto("/");
  await page.getByRole("button", { name: "開啟資料管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.data-management-dialog input[type="file"]').setInputFiles({
    name: "sorting-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 1,
      materials,
      vocabulary: [],
    }), "utf8"),
  });
  await page.getByRole("button", { name: "關閉", exact: true }).click();

  const sortOptions = page.getByRole("group", { name: "素材排序方式" });
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
  await expect(page.locator(".material-card h2")).toHaveText([
    "30隻動物",
    "Childish Gambino - This Is America",
    "blink-182 - I Miss You",
    "blink-182 - ONE MORE TIME",
  ]);
  const cardHeightAfterProgressSort = await shortTitleCard.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  const cardHeightsAfterProgressSort = await page.locator(".material-card").evaluateAll(
    (elements) => elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(new Set(cardHeightsAfterProgressSort).size).toBe(1);
  expect(cardHeightAfterProgressSort).toBe(cardHeightBeforeProgressSort);
});

test("bounds the rendered vocabulary list for large materials", async ({ page }) => {
  const words = Array.from({ length: 350 }, (_, index) => alphabeticWord(index));
  await page.goto("/");
  await page.getByRole("button", { name: "新增素材" }).click();
  await page.getByLabel("素材名稱（選填）").fill("大型詞彙列表");
  await page.getByLabel("直接貼上文字").fill(words.join(" "));
  await page.getByRole("button", { name: "儲存素材" }).click();
  await page.getByRole("link", { name: "開始閱讀" }).click();

  await page.getByRole("button", { name: "素材詞彙" }).click();

  await expect(page.getByRole("checkbox")).toHaveCount(300);
  await page.getByRole("button", { name: /顯示更多/ }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(350);
});
