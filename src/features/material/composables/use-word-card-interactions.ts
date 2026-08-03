import { ref } from "vue";

import { isValidWord, normalizeWord } from "../../../core/text/text.js";

export interface WordCardController {
  close(): void;
  open(word: string, rect: DOMRect, shouldPin?: boolean): Promise<void>;
  unpin(): void;
}

const CLOSE_DELAY_MS = 120;
const HOVER_DELAY_MS = 600;
const SELECTION_DELAY_MS = 220;

export function useWordCardInteractions() {
  const wordCard = ref<WordCardController | null>(null);
  const activeWord = ref("");
  const pinned = ref(false);
  let closeTimer: number | undefined;
  let hoverTimer: number | undefined;
  let selectionTimer: number | undefined;

  function open(
    word: string,
    rect: DOMRect,
    key = "",
    trigger: "hover" | "focus" | "touch" | "selection" | "direct" = "direct",
  ): void {
    if (pinned.value || document.activeElement?.closest(".word-card")) return;
    window.clearTimeout(hoverTimer);
    window.clearTimeout(closeTimer);
    if (trigger === "hover" && !activeWord.value) {
      hoverTimer = window.setTimeout(() => {
        hoverTimer = undefined;
        open(word, rect, key, "direct");
      }, HOVER_DELAY_MS);
      return;
    }
    activeWord.value = key;
    void wordCard.value?.open(word, rect, trigger === "selection");
  }

  function scheduleClose(): void {
    window.clearTimeout(hoverTimer);
    if (pinned.value) return;
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      const focusedWord = document.activeElement?.closest<HTMLElement>(".reading-word");
      if (pinned.value || focusedWord?.dataset.wordKey === activeWord.value) return;
      activeWord.value = "";
      wordCard.value?.close();
    }, CLOSE_DELAY_MS);
  }

  function keepOpen(): void {
    window.clearTimeout(closeTimer);
    window.clearTimeout(hoverTimer);
    window.clearTimeout(selectionTimer);
  }

  function handleClosed(): void {
    window.clearTimeout(closeTimer);
    window.clearTimeout(hoverTimer);
    activeWord.value = "";
  }

  function close(): void {
    handleClosed();
    wordCard.value?.close();
  }

  function setPinned(value: boolean): void {
    window.clearTimeout(closeTimer);
    window.clearTimeout(hoverTimer);
    pinned.value = value;
  }

  function handleSelection(): void {
    if (document.activeElement?.closest(".word-card")) return;
    const selection = window.getSelection();
    const readingContent = document.querySelector(".reading-content");
    if (
      !selection
      || selection.isCollapsed
      || selection.rangeCount === 0
      || !readingContent?.contains(selection.anchorNode)
    ) return;

    const word = normalizeWord(selection.toString());
    if (!isValidWord(word)) return;
    open(word, selection.getRangeAt(0).getBoundingClientRect(), "", "selection");
  }

  function scheduleSelectionLookup(): void {
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(handleSelection, SELECTION_DELAY_MS);
  }

  function handlePointerDown(event: PointerEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(".word-card")) return;
    if (pinned.value) {
      wordCard.value?.unpin();
      const readingWord = target.closest<HTMLElement>(".reading-word");
      const word = readingWord?.dataset.word;
      const key = readingWord?.dataset.wordKey;
      if (readingWord && word && key) {
        open(word, readingWord.getBoundingClientRect(), key);
        return;
      }
      if (target.closest(".word-item__lookup")) return;
      scheduleClose();
      return;
    }
    if (!target.closest(".reading-word, .word-item__lookup")) wordCard.value?.close();
  }

  function dispose(): void {
    window.clearTimeout(selectionTimer);
    window.clearTimeout(closeTimer);
    window.clearTimeout(hoverTimer);
    wordCard.value?.close();
  }

  return {
    activeWord,
    close,
    dispose,
    handleClosed,
    handlePointerDown,
    handleSelection,
    keepOpen,
    open,
    pinned,
    scheduleClose,
    scheduleSelectionLookup,
    setPinned,
    wordCard,
  };
}
