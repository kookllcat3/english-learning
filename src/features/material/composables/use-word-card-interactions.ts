import { ref } from "vue";

import {
  readingWordOccurrenceKey,
  vocabularyWordOccurrenceKey,
} from "../../../core/learning/contextual-word-note.js";
import type { WordNoteContext } from "../../../core/models/models.js";
import { isValidWord, normalizeWord } from "../../../core/text/text.js";

export interface WordCardController {
  close(): void;
  open(
    word: string,
    rect: DOMRect,
    noteContext: WordNoteContext | null,
    shouldPin?: boolean,
  ): Promise<void>;
  unpin(): void;
}

interface WordCardInteractionOptions {
  materialId: () => string;
}

const CLOSE_DELAY_MS = 120;
const HOVER_DELAY_MS = 600;
const SELECTION_DELAY_MS = 220;

export function useWordCardInteractions(options: WordCardInteractionOptions) {
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
    const occurrenceKey = key ? readingWordOccurrenceKey(key) : "";
    const noteContext = occurrenceKey ? createNoteContext(word, occurrenceKey) : null;
    void wordCard.value?.open(word, rect, noteContext, trigger === "selection");
  }

  function createNoteContext(word: string, occurrenceKey: string): WordNoteContext | null {
    const currentMaterialId = options.materialId();
    if (!currentMaterialId || !occurrenceKey) return null;
    return { materialId: currentMaterialId, occurrenceKey, word };
  }

  function openVocabularyWord(word: string, rect: DOMRect): void {
    window.clearTimeout(hoverTimer);
    window.clearTimeout(closeTimer);
    activeWord.value = "";
    void wordCard.value?.open(
      word,
      rect,
      createNoteContext(word, vocabularyWordOccurrenceKey(word)),
    );
  }

  function selectedOccurrenceKey(range: Range, word: string): string {
    const startElement = range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
    const endElement = range.endContainer instanceof Element
      ? range.endContainer
      : range.endContainer.parentElement;
    const startWord = startElement?.closest<HTMLElement>(".reading-word");
    const endWord = endElement?.closest<HTMLElement>(".reading-word");
    if (startWord && startWord === endWord && startWord.dataset.wordKey) {
      return readingWordOccurrenceKey(startWord.dataset.wordKey);
    }

    const startLine = startElement?.closest<HTMLElement>("[data-source-line-key]");
    const endLine = endElement?.closest<HTMLElement>("[data-source-line-key]");
    const paragraph = startElement?.closest<HTMLElement>("[data-paragraph-key]");
    if (!startLine || startLine !== endLine || !paragraph?.dataset.paragraphKey) return "";
    const sourceLine = startLine.querySelector<HTMLElement>(".reading-line");
    if (!sourceLine || !sourceLine.contains(range.startContainer) || !sourceLine.contains(range.endContainer)) {
      return "";
    }
    const prefix = range.cloneRange();
    prefix.selectNodeContents(sourceLine);
    prefix.setEnd(range.startContainer, range.startOffset);
    const startOffset = prefix.toString().length;
    return [
      "selection",
      paragraph.dataset.paragraphKey,
      startLine.dataset.sourceLineKey,
      startOffset,
      startOffset + word.length,
    ].join(":");
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
    const range = selection.getRangeAt(0);
    const occurrenceKey = selectedOccurrenceKey(range, word);
    window.clearTimeout(hoverTimer);
    window.clearTimeout(closeTimer);
    activeWord.value = "";
    void wordCard.value?.open(
      word,
      range.getBoundingClientRect(),
      createNoteContext(word, occurrenceKey),
      true,
    );
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
    openVocabularyWord,
    pinned,
    scheduleClose,
    scheduleSelectionLookup,
    setPinned,
    wordCard,
  };
}
