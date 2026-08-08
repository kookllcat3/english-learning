<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  getWordNote,
  saveWordNote,
} from "../../../core/learning/word-note-repository.js";
import { normalizeWord } from "../../../core/text/text.js";
import { htmlToMarkdown, renderMarkdown } from "../markdown.js";
import { useWordCardPosition } from "../use-word-card-position.js";
import { errorMessage } from "../../../shared/errors.js";
import { acquirePageScrollLock } from "../../../shared/page-scroll-lock.js";

const emit = defineEmits<{
  close: [];
  enter: [];
  leave: [];
  pinChange: [pinned: boolean];
}>();

const card = ref<HTMLElement | null>(null);
const hoverBridge = ref<HTMLElement | null>(null);
const editor = ref<HTMLDivElement | null>(null);
const selectedWord = ref("");
const markdown = ref("");
const savedMarkdown = ref("");
const saveMessage = ref("");
const noteLoading = ref(false);
const visible = ref(false);
const positionReady = ref(false);
const pinned = ref(false);
const pointerInteractionActive = ref(false);
let pointerInsideCard = false;
let noteEditingActive = false;
let noteCompositionActive = false;
let noteSequence = 0;
let saveTimer: number | undefined;
let releasePageScrollLock: (() => void) | null = null;
const NOTE_DRAFT_PREFIX = "english-learning:word-note-draft:";
const PAGE_SCROLL_LOCK_MEDIA_QUERY = "(hover: none), (pointer: coarse)";
const {
  clearAnchor,
  positionAt,
} = useWordCardPosition(card, hoverBridge);

function cancelScheduledSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
}

function draftKey(word: string): string {
  return `${NOTE_DRAFT_PREFIX}${normalizeWord(word)}`;
}

function preserveDraft(word: string, value: string): void {
  try {
    sessionStorage.setItem(draftKey(word), value);
  } catch {
    // IndexedDB remains the primary store; an unavailable session store only removes crash recovery.
  }
}

function readDraft(word: string): string | null {
  try {
    return sessionStorage.getItem(draftKey(word));
  } catch {
    return null;
  }
}

function discardSavedDraft(word: string, value: string): void {
  try {
    if (sessionStorage.getItem(draftKey(word)) === value) {
      sessionStorage.removeItem(draftKey(word));
    }
  } catch {
    // An unavailable session store does not invalidate the completed IndexedDB write.
  }
}

async function persistNote(): Promise<boolean> {
  cancelScheduledSave();
  const word = selectedWord.value;
  if (!word || markdown.value === savedMarkdown.value) return true;
  const noteId = normalizeWord(word);
  const value = markdown.value;
  saveMessage.value = "儲存中…";
  try {
    await saveWordNote(word, value);
    discardSavedDraft(word, value);
    if (noteId !== currentNoteId() || value !== markdown.value) return true;
    savedMarkdown.value = value;
    saveMessage.value = "已儲存";
    return true;
  } catch (error) {
    preserveDraft(word, value);
    if (noteId === currentNoteId()) {
      saveMessage.value = `${errorMessage(error, "單字筆記儲存失敗。")} 草稿仍保留在此分頁。`;
    }
    return false;
  }
}

function scheduleSave(): void {
  const word = selectedWord.value;
  if (!word) return;
  saveMessage.value = "尚未儲存";
  preserveDraft(word, markdown.value);
  cancelScheduledSave();
  saveTimer = window.setTimeout(() => void persistNote(), 500);
}

async function requestClose(): Promise<void> {
  const sequence = ++noteSequence;
  if (!await persistNote() || sequence !== noteSequence) return;
  window.speechSynthesis?.cancel();
  noteEditingActive = false;
  noteCompositionActive = false;
  positionReady.value = false;
  visible.value = false;
  selectedWord.value = "";
  clearAnchor();
  unlockPageScroll();
  if (pinned.value) {
    pinned.value = false;
    emit("pinChange", false);
  }
  emit("close");
}

function close(): void {
  void requestClose();
}

function lockPageScroll(): void {
  if (!window.matchMedia(PAGE_SCROLL_LOCK_MEDIA_QUERY).matches) {
    unlockPageScroll();
    return;
  }
  releasePageScrollLock ??= acquirePageScrollLock();
}

function unlockPageScroll(): void {
  releasePageScrollLock?.();
  releasePageScrollLock = null;
}

function togglePinned(): void {
  if (pinned.value) {
    unpin();
    return;
  }
  pin();
}

function pin(): void {
  if (pinned.value) return;
  pinned.value = true;
  emit("pinChange", true);
}

function unpin(): void {
  if (!pinned.value) return;
  pinned.value = false;
  emit("pinChange", false);
}

function keepCardOpen(): void {
  pointerInsideCard = true;
  emit("enter");
}

function closeCardWhenIdle(): void {
  pointerInsideCard = false;
  if (pointerInteractionActive.value || noteEditingActive) return;
  if (card.value?.contains(document.activeElement)) return;
  emit("leave");
}

function beginCardInteraction(event: PointerEvent): void {
  if (event.button !== 0) return;
  pointerInteractionActive.value = true;
  if (event.target instanceof Element && event.target.closest("#word-card-title")) {
    pin();
  }
  emit("enter");
}

function finishCardInteraction(): void {
  pointerInteractionActive.value = false;
  if (!pointerInsideCard) closeCardWhenIdle();
}

function handleCardFocusOut(event: FocusEvent): void {
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Element && !card.value?.contains(nextTarget)) {
    noteEditingActive = false;
  }
  queueMicrotask(closeCardWhenIdle);
}

function currentNoteId(): string {
  return normalizeWord(selectedWord.value);
}

function renderNoteEditor(): void {
  if (editor.value) editor.value.innerHTML = renderMarkdown(markdown.value);
}

async function revealPositionedCard(rect: DOMRect, sequence: number): Promise<void> {
  await nextTick();
  if (sequence !== noteSequence) return;
  renderNoteEditor();
  positionAt(rect);
  positionReady.value = true;
}

async function open(
  word: string,
  rect: DOMRect,
  shouldPin = false,
): Promise<void> {
  const sequence = ++noteSequence;
  if (!await persistNote()) return;
  if (sequence !== noteSequence) return;
  noteEditingActive = false;
  noteCompositionActive = false;
  selectedWord.value = word;
  noteLoading.value = true;
  pinned.value = shouldPin;
  if (shouldPin) emit("pinChange", true);
  markdown.value = "";
  savedMarkdown.value = "";
  saveMessage.value = "正在載入筆記…";
  positionReady.value = visible.value;
  visible.value = true;
  renderNoteEditor();
  lockPageScroll();
  await revealPositionedCard(rect, sequence);
  if (sequence !== noteSequence) return;
  try {
    const noteId = normalizeWord(word);
    const note = await getWordNote(word);
    if (sequence !== noteSequence || noteId !== currentNoteId()) return;
    savedMarkdown.value = note?.markdown ?? "";
    const draft = readDraft(word);
    markdown.value = draft ?? savedMarkdown.value;
    saveMessage.value = draft === null ? "" : "尚未儲存的草稿已復原";
    noteLoading.value = false;
    renderNoteEditor();
  } catch {
    if (sequence === noteSequence) {
      noteLoading.value = false;
      saveMessage.value = "無法載入單字筆記。";
    }
  }
}

function speak(): void {
  if (!selectedWord.value || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(selectedWord.value);
  utterance.lang = "en-US";
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}

function updateMarkdownFromEditor(): void {
  if (noteCompositionActive) return;
  if (!editor.value) return;
  markdown.value = htmlToMarkdown(editor.value.innerHTML);
  scheduleSave();
}

function beginNoteEditing(): void {
  noteEditingActive = true;
  pin();
  keepCardOpen();
}

function beginNoteComposition(): void {
  noteCompositionActive = true;
  beginNoteEditing();
}

function finishNoteComposition(): void {
  noteCompositionActive = false;
  updateMarkdownFromEditor();
}

function pastePlainText(event: ClipboardEvent): void {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") ?? "";
  document.execCommand("insertText", false, text);
  updateMarkdownFromEditor();
}

function pinWhenWordIsSelected(): void {
  if (!card.value || !visible.value) return;
  const selection = window.getSelection();
  const heading = card.value.querySelector(".word-card__heading");
  if (
    !selection
    || selection.isCollapsed
    || selection.rangeCount === 0
    || !heading?.contains(selection.anchorNode)
  ) return;
  pin();
}

defineExpose({ close, open, pin, unpin });
onMounted(() => {
  window.addEventListener("pointerup", finishCardInteraction);
  window.addEventListener("pointercancel", finishCardInteraction);
  document.addEventListener("selectionchange", pinWhenWordIsSelected);
});
onBeforeUnmount(() => {
  cancelScheduledSave();
  unlockPageScroll();
  if (selectedWord.value && markdown.value !== savedMarkdown.value) {
    preserveDraft(selectedWord.value, markdown.value);
    void persistNote();
  }
  window.speechSynthesis?.cancel();
  window.removeEventListener("pointerup", finishCardInteraction);
  window.removeEventListener("pointercancel", finishCardInteraction);
  document.removeEventListener("selectionchange", pinWhenWordIsSelected);
});
</script>

<template>
  <div v-show="visible" class="word-card-backdrop" aria-hidden="true" />
  <div
    v-show="visible"
    ref="hoverBridge"
    class="word-card-hover-bridge"
    :class="{ 'is-position-ready': positionReady }"
    aria-hidden="true"
    @pointerenter="keepCardOpen"
    @pointerleave="closeCardWhenIdle"
  />
  <aside
    v-show="visible"
    ref="card"
    class="word-card"
    :class="{ 'is-position-ready': positionReady }"
    aria-labelledby="word-card-title"
    @pointerenter="keepCardOpen"
    @pointerleave="closeCardWhenIdle"
    @pointerdown.stop="beginCardInteraction"
    @focusin="keepCardOpen"
    @focusout="handleCardFocusOut"
  >
    <div class="word-card__heading">
      <div class="word-card__word">
        <h2 id="word-card-title" lang="en">{{ selectedWord }}</h2>
      </div>
      <div class="word-card__actions">
        <button class="icon-button word-card__pronounce" type="button" aria-label="播放單字發音" title="播放發音" @click="speak">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M5 10v4h3l4 3V7l-4 3H5Z" />
            <path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" />
          </svg>
        </button>
        <button
          class="icon-button"
          type="button"
          :class="{ 'is-active': pinned }"
          :aria-label="pinned ? '取消釘選單字卡' : '釘選單字卡'"
          :title="pinned ? '取消釘選' : '釘選'"
          :aria-pressed="pinned"
          @click="togglePinned"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m9 4 6 0-1 5 3 3v2H7v-2l3-3-1-5Z" />
            <path d="M12 14v6" />
          </svg>
        </button>
      </div>
    </div>

    <div class="word-note">
      <div
        ref="editor"
        class="word-note__editor"
        :class="{ 'is-disabled': noteLoading }"
        :contenteditable="!noteLoading ? 'true' : 'false'"
        :aria-disabled="noteLoading"
        aria-label="單字 Markdown 筆記"
        :data-placeholder="`這是「${selectedWord}」的共用筆記，所有教材都會顯示…`"
        role="textbox"
        aria-multiline="true"
        @focus="beginNoteEditing"
        @input="updateMarkdownFromEditor"
        @compositionstart="beginNoteComposition"
        @compositionend="finishNoteComposition"
        @paste="pastePlainText"
        @blur="persistNote"
      />
      <small v-if="saveMessage" class="word-note__status" role="status">{{ saveMessage }}</small>
    </div>
  </aside>
</template>
