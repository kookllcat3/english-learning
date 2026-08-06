import { expect, test } from "@playwright/test";

import {
  createMaterial,
  materialContent,
  materialTitle,
  storedWordNotes,
} from "./test-helpers";

test("reveals a restored note card only after its final position is ready", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const word = page.locator('[data-word="bear"]').first();
  const editor = page.getByLabel("單字 Markdown 筆記");
  const note = "A long restored note ".repeat(30);
  await word.hover();
  await expect(editor).toHaveAttribute("data-placeholder", "這是「bear」的共用筆記，所有教材都會顯示…");
  await editor.fill(note);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator(".word-card")).toBeAttached();

  await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".word-card");
    if (!card) throw new Error("word card not found");
    const samples: Array<{ text: string; top: number; left: number }> = [];
    (window as typeof window & { __wordCardRevealSamples?: typeof samples })
      .__wordCardRevealSamples = samples;
    const captureFrames = (remaining: number): void => {
      const rect = card.getBoundingClientRect();
      const noteEditor = card.querySelector<HTMLElement>(".word-note__editor");
      samples.push({ text: noteEditor?.innerText ?? "", top: rect.top, left: rect.left });
      if (remaining > 1) requestAnimationFrame(() => captureFrames(remaining - 1));
    };
    new MutationObserver(() => {
      if (card.classList.contains("is-position-ready") && samples.length === 0) captureFrames(8);
    }).observe(card, { attributes: true, attributeFilter: ["class"] });
  });

  await word.hover();
  await expect(page.locator(".word-card")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & {
      __wordCardRevealSamples?: Array<{ text: string; top: number; left: number }>;
    }).__wordCardRevealSamples?.length ?? 0
  ))).toBe(8);
  const samples = await page.evaluate(() => (
    (window as typeof window & {
      __wordCardRevealSamples?: Array<{ text: string; top: number; left: number }>;
    }).__wordCardRevealSamples ?? []
  ));
  expect(samples[0]?.text).toContain("A long restored note");
  expect(Math.max(...samples.map(({ top }) => top)) - Math.min(...samples.map(({ top }) => top)))
    .toBeLessThan(1);
  expect(Math.max(...samples.map(({ left }) => left)) - Math.min(...samples.map(({ left }) => left)))
    .toBeLessThan(1);
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
  await expect(page.getByRole("button", { name: "取消釘選單字卡" })).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-word="runs"]').first().hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  await editor.fill("large animal");
  await expect(page.getByRole("status")).toHaveText("已儲存");

  await page.reload();
  await page.locator('[data-word="bear"]').first().hover();
  await expect(page.getByRole("heading", { name: "bear", level: 2 })).toBeVisible();
  await expect(page.getByLabel("單字 Markdown 筆記")).toContainText("large animal");
});

test("pins a note card when editing begins and keeps it open through IME focus changes", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();
  await page.locator('[data-word="bear"]').first().hover();

  const card = page.locator(".word-card");
  const editor = page.getByLabel("單字 Markdown 筆記");
  const wordHeading = page.getByRole("heading", { name: "bear", level: 2 });
  const initialScrollY = await page.evaluate(() => window.scrollY);
  await editor.click();
  await editor.dispatchEvent("compositionstart", { data: "ㄅ" });
  await card.dispatchEvent("pointerleave", { pointerId: 94, pointerType: "mouse" });
  await editor.evaluate((element) => (element as HTMLElement).blur());
  await page.waitForTimeout(200);

  await expect(wordHeading).toBeVisible();
  await expect(page.getByRole("button", { name: "取消釘選單字卡" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(initialScrollY);

  await editor.focus();
  await editor.dispatchEvent("compositionend", { data: "筆記" });
  await editor.fill("筆記內容");
  await expect(page.getByRole("status")).toHaveText("已儲存");
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
      if (this.name === "wordNotes") {
        throw new DOMException("Simulated write failure", "UnknownError");
      }
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
  await page.waitForTimeout(400);
  await expect(bearHeading).toBeHidden();
  await expect(bearHeading).toBeVisible({ timeout: 800 });
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

test("keeps desktop scrolling responsive while the word card is open", async ({ page }) => {
  const longContent = Array.from({ length: 40 }, () => materialContent).join("\n");
  await createMaterial(page, "Word card scroll lock", longContent);
  await page.locator(".material-card .button--primary").first().click();

  const wordHeading = page.getByRole("heading", { name: "bear", level: 2 });
  await page.locator('[data-word="bear"]').first().hover();
  await expect(wordHeading).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));

  const readingPosition = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(readingPosition);

  await page.locator("h1").click();
  await expect(wordHeading).toBeHidden();

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator(".material-view-switcher__button").nth(1).click();
  await page.locator(".word-item__lookup").first().click();
  await expect(page.locator(".word-card h2")).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).position))
    .not.toBe("fixed");
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

test("persists a partial-word selection with its exact text range", async ({ page }) => {
  await createMaterial(page);
  await page.getByRole("link", { name: "開始閱讀" }).click();

  async function selectPartialWord(): Promise<void> {
    await page.locator('[data-word="bear"]').first().evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

      const boundaryAt = (targetOffset: number): { node: Text; offset: number } => {
        let remaining = targetOffset;
        for (const node of textNodes) {
          if (remaining <= node.data.length) return { node, offset: remaining };
          remaining -= node.data.length;
        }
        throw new Error("partial selection boundary not found");
      };
      const start = boundaryAt(1);
      const end = boundaryAt(4);
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
  }

  await selectPartialWord();
  const editor = page.getByLabel("單字 Markdown 筆記");
  await expect(page.getByRole("heading", { name: "ear", level: 2 })).toBeVisible();
  await editor.fill("partial-word note");
  await expect(page.getByRole("status")).toHaveText("已儲存");
  await expect.poll(async () => storedWordNotes(page)).toContainEqual({
    markdown: "partial-word note",
    word: "ear",
  });

  await page.reload();
  await selectPartialWord();
  await expect(editor).toHaveText("partial-word note");
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

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.locator(".word-card").dispatchEvent("pointerleave", { pointerId: 93 });
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

test("shares a word note across repeated words and the vocabulary entry", async ({ page }) => {
  await createMaterial(
    page,
    "Shared word notes",
    "The driver waits.\n司機正在等待。\n\nThe driver leaves.\n司機離開了。",
  );
  await page.getByRole("link", { name: "開始閱讀" }).click();

  const repeatedWords = page.locator('[data-word="driver"]');
  const editor = page.getByLabel("單字 Markdown 筆記");
  await repeatedWords.nth(0).focus();
  await editor.fill("first shared note");
  await expect(page.getByRole("status")).toHaveText("已儲存");

  await page.getByRole("button", { name: "取消釘選單字卡" }).click();
  await editor.evaluate((element) => (element as HTMLElement).blur());
  await page.locator(".word-card").dispatchEvent("pointerleave");
  await repeatedWords.nth(1).focus();
  await expect(editor).toHaveText("first shared note");

  await page.getByRole("button", { name: "教材詞彙" }).click();
  await page.locator(".word-item__lookup", { hasText: "driver" }).click();
  await expect(editor).toHaveText("first shared note");
  await editor.fill("updated shared note");
  await expect(page.getByRole("status")).toHaveText("已儲存");

  await page.reload();
  await repeatedWords.nth(0).focus();
  await expect(editor).toHaveText("updated shared note");
  await page.locator(".word-card").dispatchEvent("pointerleave");
  await repeatedWords.nth(1).focus();
  await expect(editor).toHaveText("updated shared note");
});
