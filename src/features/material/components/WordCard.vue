<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { VocabularyRecord } from "../../../core/models/models.js";
import {
  getWordNote,
  saveWordNote,
} from "../../../core/learning/word-note-repository.js";
import { familiarityLevel, type FamiliarityLevel } from "../familiarity.js";
import { htmlToMarkdown, renderMarkdown } from "../markdown.js";
import { calculateWordCardTop } from "../word-card-position.js";

const props = defineProps<{
  familiarityLevels: FamiliarityLevel[];
  knownWords: Set<string>;
  vocabularyProgress: Map<string, VocabularyRecord>;
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
const familiarityDetailsOpen = ref(false);
const visible = ref(false);
const pinned = ref(false);
const pointerInteractionActive = ref(false);
let pointerInsideCard = false;
let noteSequence = 0;
let saveTimer: number | undefined;
let savedSelection: Range | null = null;
let anchorRect: DOMRect | null = null;
let cardResizeObserver: ResizeObserver | null = null;

const isKnown = computed(() => props.knownWords.has(selectedWord.value));
const materialCount = computed(() =>
  props.vocabularyProgress.get(selectedWord.value)?.materialCount ?? 0);
const currentLevel = computed(() =>
  familiarityLevel(props.familiarityLevels, materialCount.value));
const nextLevel = computed(() =>
  props.familiarityLevels.find((item) => item.level === currentLevel.value.level + 1));
const levelProgress = computed(() => {
  if (!nextLevel.value) return 100;
  const span = nextLevel.value.minMaterials - currentLevel.value.minMaterials;
  return Math.min(100, Math.max(
    0,
    ((materialCount.value - currentLevel.value.minMaterials) / span) * 100,
  ));
});
const remainingMaterials = computed(() =>
  Math.max(0, (nextLevel.value?.minMaterials ?? materialCount.value) - materialCount.value));
const familiarityIndicatorStyle = computed(() => ({
  "--familiarity-level-background-opacity": String(currentLevel.value.outlineOpacity),
}));

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
    saveMessage.value = error instanceof Error ? error.message : "單字筆記儲存失敗。";
  }
}

function scheduleSave(): void {
  saveMessage.value = "尚未儲存";
  cancelScheduledSave();
  saveTimer = window.setTimeout(() => void persistNote(), 500);
}

function close(): void {
  void persistNote();
  window.speechSynthesis?.cancel();
  visible.value = false;
  selectedWord.value = "";
  anchorRect = null;
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

function clampPosition(left: number, top: number): { left: number; top: number } {
  if (!card.value) return { left, top };
  const margin = 12;
  const rect = card.value.getBoundingClientRect();
  const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
  const minTop = Math.max(margin, headerBottom + margin);
  return {
    left: Math.min(window.innerWidth - rect.width - margin, Math.max(margin, left)),
    top: Math.min(Math.max(minTop, window.innerHeight - rect.height - margin), Math.max(minTop, top)),
  };
}

function setPosition(left: number, top: number): void {
  if (!card.value) return;
  const position = clampPosition(left, top);
  card.value.style.left = `${position.left}px`;
  card.value.style.top = `${position.top}px`;
}

function positionAt(rect: DOMRect): void {
  if (!card.value) return;
  anchorRect = rect;
  const margin = 12;
  const gap = 10;
  const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
  const minimumTop = Math.max(margin, headerBottom + margin);
  const viewportHeight = Math.max(210, window.innerHeight - minimumTop - margin);
  card.value.style.maxHeight = `${Math.min(560, viewportHeight)}px`;
  const cardRect = card.value.getBoundingClientRect();
  const top = calculateWordCardTop({
    cardHeight: cardRect.height,
    gap,
    margin,
    minimumTop,
    targetBottom: rect.bottom,
    targetTop: rect.top,
    viewportHeight: window.innerHeight,
  });
  const left = Math.min(
    window.innerWidth - cardRect.width - margin,
    Math.max(margin, rect.left + (rect.width - cardRect.width) / 2),
  );
  card.value.style.left = `${left}px`;
  card.value.style.top = `${top}px`;
}

async function open(word: string, rect: DOMRect): Promise<void> {
  const sequence = ++noteSequence;
  cancelScheduledSave();
  selectedWord.value = word;
  markdown.value = "";
  savedMarkdown.value = "";
  saveMessage.value = "";
  familiarityDetailsOpen.value = false;
  visible.value = true;
  await nextTick();
  if (!cardResizeObserver && card.value) {
    cardResizeObserver = new ResizeObserver(() => {
      if (visible.value && anchorRect) positionAt(anchorRect);
    });
    cardResizeObserver.observe(card.value);
  }
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
  if (!visible.value || !card.value) return;
  const rect = card.value.getBoundingClientRect();
  setPosition(rect.left, rect.top);
}

defineExpose({ close, keepInViewport, open });
onMounted(() => {
  window.addEventListener("pointerup", finishCardInteraction);
  window.addEventListener("pointercancel", finishCardInteraction);
});
onBeforeUnmount(() => {
  cancelScheduledSave();
  void persistNote();
  window.speechSynthesis?.cancel();
  cardResizeObserver?.disconnect();
  cardResizeObserver = null;
  window.removeEventListener("pointerup", finishCardInteraction);
  window.removeEventListener("pointercancel", finishCardInteraction);
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
        <div
          class="word-card__familiarity"
          @mouseenter="familiarityDetailsOpen = true"
          @mouseleave="familiarityDetailsOpen = false"
        >
          <button
            type="button"
            :class="{ 'has-familiarity-level': currentLevel.level > 0 }"
            :style="familiarityIndicatorStyle"
            :aria-expanded="familiarityDetailsOpen"
            aria-label="查看熟悉度升級進度"
            @focus="familiarityDetailsOpen = true"
            @blur="familiarityDetailsOpen = false"
            @click="familiarityDetailsOpen = true"
          >
            Lv.{{ currentLevel.level }}
          </button>
          <div v-show="familiarityDetailsOpen" class="familiarity-progress" role="tooltip">
            <div class="familiarity-progress__heading">
              <strong>熟悉度 Lv.{{ currentLevel.level }}</strong>
              <span v-if="nextLevel">{{ materialCount }} / {{ nextLevel.minMaterials }}</span>
              <span v-else>MAX</span>
            </div>
            <div
              class="familiarity-progress__track"
              role="progressbar"
              :aria-valuenow="levelProgress"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span :style="{ width: `${levelProgress}%` }" />
            </div>
            <p v-if="nextLevel">再於 {{ remainingMaterials }} 份素材標記認識即可升到 Lv.{{ nextLevel.level }}</p>
            <p v-else>已達目前最高熟悉度等級</p>
          </div>
        </div>
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
