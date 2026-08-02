<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  getWordNote,
  saveWordNote,
} from "../../../core/learning/word-note-repository.js";
import { htmlToMarkdown, renderMarkdown } from "../markdown.js";
import { useWordCardPosition } from "../use-word-card-position.js";
import { errorMessage } from "../../../shared/errors.js";

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
const markdown = ref("");
const savedMarkdown = ref("");
const saveMessage = ref("");
const visible = ref(false);
const pinned = ref(false);
const pointerInteractionActive = ref(false);
let pointerInsideCard = false;
let noteSequence = 0;
let saveTimer: number | undefined;
const NOTE_DRAFT_PREFIX = "english-learning:word-note-draft:";
const {
  clearAnchor,
  positionAt,
} = useWordCardPosition(card);

const isKnown = computed(() => props.knownWords.has(selectedWord.value));

function cancelScheduledSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
}

function draftKey(word: string): string {
  return `${NOTE_DRAFT_PREFIX}${encodeURIComponent(word)}`;
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
    if (sessionStorage.getItem(draftKey(word)) === value) sessionStorage.removeItem(draftKey(word));
  } catch {
    // An unavailable session store does not invalidate the completed IndexedDB write.
  }
}

async function persistNote(): Promise<boolean> {
  cancelScheduledSave();
  if (!selectedWord.value || markdown.value === savedMarkdown.value) return true;
  const word = selectedWord.value;
  const value = markdown.value;
  saveMessage.value = "儲存中…";
  try {
    await saveWordNote(word, value);
    discardSavedDraft(word, value);
    if (word !== selectedWord.value || value !== markdown.value) return true;
    savedMarkdown.value = value;
    saveMessage.value = "已儲存";
    return true;
  } catch (error) {
    preserveDraft(word, value);
    if (word === selectedWord.value) {
      saveMessage.value = `${errorMessage(error, "單字筆記儲存失敗。")} 草稿仍保留在此分頁。`;
    }
    return false;
  }
}

function scheduleSave(): void {
  saveMessage.value = "尚未儲存";
  if (selectedWord.value) preserveDraft(selectedWord.value, markdown.value);
  cancelScheduledSave();
  saveTimer = window.setTimeout(() => void persistNote(), 500);
}

async function requestClose(): Promise<void> {
  const sequence = ++noteSequence;
  if (!await persistNote() || sequence !== noteSequence) return;
  window.speechSynthesis?.cancel();
  visible.value = false;
  selectedWord.value = "";
  clearAnchor();
  if (pinned.value) {
    pinned.value = false;
    emit("pinChange", false);
  }
  emit("close");
}

function close(): void {
  void requestClose();
}

function togglePinned(): void {
  pinned.value = !pinned.value;
  emit("pinChange", pinned.value);
}

function pin(): void {
  if (pinned.value) return;
  pinned.value = true;
  emit("pinChange", true);
}

function keepCardOpen(): void {
  pointerInsideCard = true;
  emit("enter");
}

function closeCardWhenIdle(): void {
  pointerInsideCard = false;
  if (pointerInteractionActive.value) return;
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

function handleCardFocusOut(): void {
  queueMicrotask(closeCardWhenIdle);
}

async function open(word: string, rect: DOMRect, shouldPin = false): Promise<void> {
  const sequence = ++noteSequence;
  if (!await persistNote()) return;
  if (sequence !== noteSequence) return;
  selectedWord.value = word;
  pinned.value = shouldPin;
  if (shouldPin) emit("pinChange", true);
  markdown.value = "";
  savedMarkdown.value = "";
  saveMessage.value = "";
  visible.value = true;
  await nextTick();
  positionAt(rect);
  try {
    const note = await getWordNote(word);
    if (sequence !== noteSequence || word !== selectedWord.value) return;
    savedMarkdown.value = note?.markdown ?? "";
    const draft = readDraft(word);
    markdown.value = draft ?? savedMarkdown.value;
    saveMessage.value = draft === null ? "" : "尚未儲存的草稿已復原";
    await nextTick();
    if (editor.value) editor.value.innerHTML = renderMarkdown(markdown.value);
  } catch {
    if (sequence === noteSequence) saveMessage.value = "無法載入單字筆記。";
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
  if (!editor.value) return;
  markdown.value = htmlToMarkdown(editor.value.innerHTML);
  scheduleSave();
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

defineExpose({ close, open, pin });
onMounted(() => {
  window.addEventListener("pointerup", finishCardInteraction);
  window.addEventListener("pointercancel", finishCardInteraction);
  document.addEventListener("selectionchange", pinWhenWordIsSelected);
});
onBeforeUnmount(() => {
  cancelScheduledSave();
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
        contenteditable="true"
        aria-label="單字 Markdown 筆記"
        data-placeholder="記下解釋、例句或聯想…"
        role="textbox"
        aria-multiline="true"
        @input="updateMarkdownFromEditor"
        @paste="pastePlainText"
        @blur="persistNote"
      />
      <small v-if="saveMessage" class="word-note__status" role="status">{{ saveMessage }}</small>
    </div>
  </aside>
</template>
