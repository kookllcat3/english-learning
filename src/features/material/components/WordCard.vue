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
let savedSelection: Range | null = null;
const {
  clearAnchor,
  keepInViewport: keepPositionInViewport,
  positionAt,
} = useWordCardPosition(card);

const isKnown = computed(() => props.knownWords.has(selectedWord.value));

function cancelScheduledSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
}

async function persistNote(): Promise<void> {
  cancelScheduledSave();
  if (!selectedWord.value || markdown.value === savedMarkdown.value) return;
  const word = selectedWord.value;
  const value = markdown.value;
  saveMessage.value = "儲存中…";
  try {
    await saveWordNote(word, value);
    if (word !== selectedWord.value || value !== markdown.value) return;
    savedMarkdown.value = value;
    saveMessage.value = "已儲存";
  } catch (error) {
    if (word !== selectedWord.value) return;
    saveMessage.value = errorMessage(error, "單字筆記儲存失敗。");
  }
}

function scheduleSave(): void {
  saveMessage.value = "尚未儲存";
  cancelScheduledSave();
  saveTimer = window.setTimeout(() => void persistNote(), 500);
}

function close(): void {
  noteSequence += 1;
  void persistNote();
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
  await persistNote();
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
    markdown.value = note?.markdown ?? "";
    savedMarkdown.value = markdown.value;
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

function runEditorCommand(command: string, value?: string): void {
  if (!editor.value) return;
  editor.value.focus();
  if (savedSelection) {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(savedSelection);
  }
  document.execCommand(command, false, value);
  savedSelection = null;
  updateMarkdownFromEditor();
}

function rememberEditorSelection(): void {
  const selection = window.getSelection();
  if (
    !editor.value
    || !selection
    || selection.rangeCount === 0
    || !editor.value.contains(selection.getRangeAt(0).commonAncestorContainer)
  ) return;
  savedSelection = selection.getRangeAt(0).cloneRange();
}

function createLink(): void {
  const url = window.prompt("輸入連結網址（https://）");
  if (!url) return;
  runEditorCommand("createLink", url);
}

function pastePlainText(event: ClipboardEvent): void {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") ?? "";
  document.execCommand("insertText", false, text);
  updateMarkdownFromEditor();
}

function keepInViewport(): void {
  if (visible.value) keepPositionInViewport();
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

defineExpose({ close, keepInViewport, open, pin });
onMounted(() => {
  window.addEventListener("pointerup", finishCardInteraction);
  window.addEventListener("pointercancel", finishCardInteraction);
  document.addEventListener("selectionchange", pinWhenWordIsSelected);
});
onBeforeUnmount(() => {
  cancelScheduledSave();
  void persistNote();
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
      <div class="word-note__toolbar" role="toolbar" aria-label="Markdown 格式工具列">
        <button type="button" title="粗體" aria-label="粗體" @mousedown.prevent="rememberEditorSelection" @click="runEditorCommand('bold')"><strong>B</strong></button>
        <button type="button" title="斜體" aria-label="斜體" @mousedown.prevent="rememberEditorSelection" @click="runEditorCommand('italic')"><em>I</em></button>
        <button type="button" title="標題" aria-label="標題" @mousedown.prevent="rememberEditorSelection" @click="runEditorCommand('formatBlock', 'h3')">H</button>
        <button type="button" title="項目清單" aria-label="項目清單" @mousedown.prevent="rememberEditorSelection" @click="runEditorCommand('insertUnorderedList')">•</button>
        <button type="button" title="編號清單" aria-label="編號清單" @mousedown.prevent="rememberEditorSelection" @click="runEditorCommand('insertOrderedList')">1.</button>
        <button type="button" title="引用" aria-label="引用" @mousedown.prevent="rememberEditorSelection" @click="runEditorCommand('formatBlock', 'blockquote')">❯</button>
        <button type="button" title="連結" aria-label="連結" @mousedown.prevent="rememberEditorSelection" @click="createLink">↗</button>
      </div>
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
