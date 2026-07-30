<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { lookupWord } from "../../../core/services/dictionary-service.js";
import type { DictionaryDefinition } from "../../../core/models/models.js";

interface DragState {
  pointerId: number;
  startLeft: number;
  startTop: number;
  startX: number;
  startY: number;
}

const props = defineProps<{ knownWords: Set<string> }>();
const emit = defineEmits<{ toggleKnown: [word: string] }>();

const card = ref<HTMLElement | null>(null);
const selectedWord = ref("");
const phonetic = ref("");
const audioUrl = ref("");
const definitions = ref<DictionaryDefinition[]>([]);
const message = ref("");
const loading = ref(false);
const visible = ref(false);
const dragged = ref(false);
const dragging = ref(false);
let anchorRect: DOMRect | null = null;
let currentAudio: HTMLAudioElement | null = null;
let lookupController: AbortController | null = null;
let lookupSequence = 0;
let dragState: DragState | null = null;

const isKnown = computed(() => props.knownWords.has(selectedWord.value));

function stopAudio(): void {
  if (!currentAudio) return;
  currentAudio.pause();
  currentAudio.removeAttribute("src");
  currentAudio.load();
  currentAudio = null;
}

function close(): void {
  lookupSequence += 1;
  lookupController?.abort();
  lookupController = null;
  stopAudio();
  window.speechSynthesis?.cancel();
  dragState = null;
  dragging.value = false;
  visible.value = false;
  selectedWord.value = "";
}

function clampPosition(left: number, top: number): { left: number; top: number } {
  if (!card.value) return { left, top };
  const margin = 12;
  const cardRect = card.value.getBoundingClientRect();
  const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
  const minTop = Math.max(margin, headerBottom + margin);
  const maxTop = Math.max(minTop, window.innerHeight - cardRect.height - margin);
  return {
    left: Math.min(window.innerWidth - cardRect.width - margin, Math.max(margin, left)),
    top: Math.min(maxTop, Math.max(minTop, top)),
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
  const margin = 12;
  const cardRect = card.value.getBoundingClientRect();
  const below = rect.bottom + 10;
  const top = below + cardRect.height <= window.innerHeight - margin
    ? below
    : rect.top - cardRect.height - 10;
  setPosition(rect.left + (rect.width / 2) - (cardRect.width / 2), top);
}

async function open(word: string, rect: DOMRect): Promise<void> {
  if (word === selectedWord.value && visible.value) return;
  lookupController?.abort();
  lookupController = new AbortController();
  const controller = lookupController;
  const sequence = ++lookupSequence;
  selectedWord.value = word;
  phonetic.value = "";
  audioUrl.value = "";
  definitions.value = [];
  message.value = "";
  loading.value = true;
  dragged.value = false;
  anchorRect = rect;
  visible.value = true;
  await nextTick();
  positionAt(rect);

  try {
    const entry = await lookupWord(word, { signal: controller.signal });
    if (sequence !== lookupSequence || word !== selectedWord.value) return;
    phonetic.value = entry.phonetic;
    audioUrl.value = entry.audioUrl;
    definitions.value = entry.definitions;
    if (entry.definitions.length === 0) message.value = "找不到可顯示的英文解釋。";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (sequence !== lookupSequence || word !== selectedWord.value) return;
    const errorMessage = error instanceof Error ? error.message : "字典查詢失敗。";
    message.value = `${errorMessage} 仍可使用上方按鈕聆聽發音。`;
  } finally {
    if (sequence === lookupSequence) {
      loading.value = false;
      await nextTick();
      if (!dragged.value && anchorRect) positionAt(anchorRect);
    }
    if (lookupController === controller) lookupController = null;
  }
}

function speakWithBrowser(): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(selectedWord.value);
  utterance.lang = "en-US";
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}

function speak(): void {
  if (!selectedWord.value) return;
  if (!audioUrl.value) {
    speakWithBrowser();
    return;
  }
  stopAudio();
  const audio = new Audio(audioUrl.value);
  currentAudio = audio;
  const release = (): void => {
    audio.removeAttribute("src");
    audio.load();
    if (currentAudio === audio) currentAudio = null;
  };
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  audio.play().catch(() => {
    release();
    speakWithBrowser();
  });
}

function startDrag(event: PointerEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (!card.value || event.button !== 0 || target?.closest("button, a")) return;
  const rect = card.value.getBoundingClientRect();
  dragState = {
    pointerId: event.pointerId,
    startLeft: rect.left,
    startTop: rect.top,
    startX: event.clientX,
    startY: event.clientY,
  };
  dragged.value = true;
  dragging.value = true;
  card.value.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function moveDrag(event: PointerEvent): void {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  setPosition(
    dragState.startLeft + event.clientX - dragState.startX,
    dragState.startTop + event.clientY - dragState.startY,
  );
}

function stopDrag(event: PointerEvent): void {
  if (!card.value || !dragState || event.pointerId !== dragState.pointerId) return;
  if (card.value.hasPointerCapture(event.pointerId)) card.value.releasePointerCapture(event.pointerId);
  dragState = null;
  dragging.value = false;
}

function keepInViewport(): void {
  if (!visible.value || !card.value) return;
  const rect = card.value.getBoundingClientRect();
  setPosition(rect.left, rect.top);
}

defineExpose({ close, keepInViewport, open });
onBeforeUnmount(close);
</script>

<template>
  <aside
    v-show="visible"
    ref="card"
    class="word-card"
    :class="{ 'is-dragging': dragging }"
    aria-labelledby="word-card-title"
    @pointermove="moveDrag"
    @pointerup="stopDrag"
    @pointercancel="stopDrag"
  >
    <div class="word-card__heading" @pointerdown="startDrag">
      <div>
        <h2 id="word-card-title" lang="en">{{ selectedWord }}</h2>
        <p lang="en">{{ phonetic }}</p>
      </div>
      <button class="icon-button" type="button" aria-label="關閉單字卡" @click="close">×</button>
    </div>
    <div class="word-card__actions">
      <button class="button button--secondary" type="button" @click="speak">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 10v4h3l4 3V7l-4 3H5Z" />
          <path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" />
        </svg>
        發音
      </button>
      <button
        class="button button--secondary"
        type="button"
        :aria-pressed="isKnown"
        @click="emit('toggleKnown', selectedWord)"
      >
        {{ isKnown ? "標記為不認識" : "標記為已認識" }}
      </button>
    </div>
    <div class="word-card__scroll">
      <div class="word-card__body" aria-live="polite">
        <p v-if="loading" class="word-card__loading">正在查詢字典…</p>
        <p v-else-if="message" class="word-card__error">{{ message }}</p>
        <section v-for="(definition, index) in definitions" v-else :key="index" class="word-definition">
          <strong>{{ definition.partOfSpeech || "definition" }}</strong>
          <p>{{ definition.definition }}</p>
          <em v-if="definition.example" lang="en">“{{ definition.example }}”</em>
        </section>
      </div>
      <p class="word-card__source">
        字典資料來自
        <a href="https://dictionaryapi.dev/" target="_blank" rel="noopener noreferrer">Free Dictionary API</a>
        ，發音失敗時會改用瀏覽器語音。
      </p>
    </div>
  </aside>
</template>
