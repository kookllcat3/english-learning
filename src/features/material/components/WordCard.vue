<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  getContextualWordNote,
  saveContextualWordNote,
} from "../../../core/learning/contextual-word-note-repository.js";
import { contextualWordNoteId } from "../../../core/learning/contextual-word-note.js";
import type { WordNoteContext } from "../../../core/models/models.js";
import { htmlToMarkdown, renderMarkdown } from "../markdown.js";
import { useWordCardPosition } from "../use-word-card-position.js";
import { errorMessage } from "../../../shared/errors.js";
import { acquirePageScrollLock } from "../../../shared/page-scroll-lock.js";

const props = defineProps<{
  knownWords: Set<string>;
}>();
const emit = defineEmits<{
  close: [];
  enter: [];
  leave: [];
  pinChange: [pinned: boolean];
  toggleKnown: [word: string];
}>();

const card = ref<HTMLElement | null>(null);
const editor = ref<HTMLDivElement | null>(null);
const selectedWord = ref("");
const selectedNoteContext = ref<WordNoteContext | null>(null);
const markdown = ref("");
const savedMarkdown = ref("");
const saveMessage = ref("");
const noteLoading = ref(false);
const visible = ref(false);
const pinned = ref(false);
const pointerInteractionActive = ref(false);
let pointerInsideCard = false;
let noteEditingActive = false;
let noteCompositionActive = false;
let noteSequence = 0;
let saveTimer: number | undefined;
let releasePageScrollLock: (() => void) | null = null;
const NOTE_DRAFT_PREFIX = "english-learning:contextual-word-note-draft:";
const PAGE_SCROLL_LOCK_MEDIA_QUERY = "(hover: none), (pointer: coarse)";
const {
  clearAnchor,
  positionAt,
} = useWordCardPosition(card);

const isKnown = computed(() => props.knownWords.has(selectedWord.value));

function cancelScheduledSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
}

function draftKey(context: WordNoteContext): string {
  return `${NOTE_DRAFT_PREFIX}${contextualWordNoteId(context)}`;
}

function preserveDraft(context: WordNoteContext, value: string): void {
  try {
    sessionStorage.setItem(draftKey(context), value);
  } catch {
    // IndexedDB remains the primary store; an unavailable session store only removes crash recovery.
  }
}

function readDraft(context: WordNoteContext): string | null {
  try {
    return sessionStorage.getItem(draftKey(context));
  } catch {
    return null;
  }
}

function discardSavedDraft(context: WordNoteContext, value: string): void {
  try {
    if (sessionStorage.getItem(draftKey(context)) === value) {
      sessionStorage.removeItem(draftKey(context));
    }
  } catch {
    // An unavailable session store does not invalidate the completed IndexedDB write.
  }
}

async function persistNote(): Promise<boolean> {
  cancelScheduledSave();
  const context = selectedNoteContext.value;
  if (!context || markdown.value === savedMarkdown.value) return true;
  const noteId = contextualWordNoteId(context);
  const value = markdown.value;
  saveMessage.value = "儲存中…";
  try {
    await saveContextualWordNote(context, value);
    discardSavedDraft(context, value);
    if (noteId !== currentNoteId() || value !== markdown.value) return true;
    savedMarkdown.value = value;
    saveMessage.value = "已儲存";
    return true;
  } catch (error) {
    preserveDraft(context, value);
    if (noteId === currentNoteId()) {
      saveMessage.value = `${errorMessage(error, "單字筆記儲存失敗。")} 草稿仍保留在此分頁。`;
    }
    return false;
  }
}

function scheduleSave(): void {
  const context = selectedNoteContext.value;
  if (!context) return;
  saveMessage.value = "尚未儲存";
  preserveDraft(context, markdown.value);
  cancelScheduledSave();
  saveTimer = window.setTimeout(() => void persistNote(), 500);
}

async function requestClose(): Promise<void> {
  const sequence = ++noteSequence;
  if (!await persistNote() || sequence !== noteSequence) return;
  window.speechSynthesis?.cancel();
  noteEditingActive = false;
  noteCompositionActive = false;
  visible.value = false;
  selectedWord.value = "";
  selectedNoteContext.value = null;
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
  return selectedNoteContext.value ? contextualWordNoteId(selectedNoteContext.value) : "";
}

async function open(
  word: string,
  rect: DOMRect,
  noteContext: WordNoteContext | null,
  shouldPin = false,
): Promise<void> {
  const sequence = ++noteSequence;
  if (!await persistNote()) return;
  if (sequence !== noteSequence) return;
  noteEditingActive = false;
  noteCompositionActive = false;
  selectedWord.value = word;
  selectedNoteContext.value = noteContext;
  noteLoading.value = noteContext !== null;
  pinned.value = shouldPin;
  if (shouldPin) emit("pinChange", true);
  markdown.value = "";
  savedMarkdown.value = "";
  saveMessage.value = noteContext ? "正在載入筆記…" : "此選取沒有固定教材位置，無法儲存筆記。";
  visible.value = true;
  lockPageScroll();
  await nextTick();
  positionAt(rect);
  if (!noteContext) {
    if (editor.value) editor.value.innerHTML = "";
    return;
  }
  try {
    const noteId = contextualWordNoteId(noteContext);
    const note = await getContextualWordNote(noteContext);
    if (sequence !== noteSequence || noteId !== currentNoteId()) return;
    savedMarkdown.value = note?.markdown ?? "";
    const draft = readDraft(noteContext);
    markdown.value = draft ?? savedMarkdown.value;
    saveMessage.value = draft === null ? "" : "尚未儲存的草稿已復原";
    noteLoading.value = false;
    await nextTick();
    if (editor.value) editor.value.innerHTML = renderMarkdown(markdown.value);
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
  if (!selectedNoteContext.value) return;
  if (noteCompositionActive) return;
  if (!editor.value) return;
  markdown.value = htmlToMarkdown(editor.value.innerHTML);
  scheduleSave();
}

function beginNoteEditing(): void {
  if (!selectedNoteContext.value) return;
  noteEditingActive = true;
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
  if (selectedNoteContext.value && markdown.value !== savedMarkdown.value) {
    preserveDraft(selectedNoteContext.value, markdown.value);
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
  <aside
    v-show="visible"
    ref="card"
    class="word-card"
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
        <button class="icon-button word-card__pronounce" type="button" aria-label="播放單字發音" title="播放發音" @click="speak">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M5 10v4h3l4 3V7l-4 3H5Z" />
            <path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" />
          </svg>
        </button>
        <button
          class="icon-button word-card__known"
          type="button"
          :class="{ 'is-active': isKnown }"
          :aria-label="isKnown ? '標記為不認識' : '標記為已認識'"
          :title="isKnown ? '標記為不認識' : '標記為已認識'"
          :aria-pressed="isKnown"
          @click="emit('toggleKnown', selectedWord)"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 12 4 4 8-9" /></svg>
        </button>
      </div>
      <div class="word-card__actions">
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
        :class="{ 'is-disabled': !selectedNoteContext || noteLoading }"
        :contenteditable="selectedNoteContext && !noteLoading ? 'true' : 'false'"
        :aria-disabled="!selectedNoteContext || noteLoading"
        aria-label="單字 Markdown 筆記"
        data-placeholder="記下解釋、例句或聯想…"
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
