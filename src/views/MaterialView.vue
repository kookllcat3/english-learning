<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { RouterLink, useRoute } from "vue-router";
import {
  getMaterial,
  getVocabularyProgress,
  setWordsKnown,
} from "../core/learning/learning-repository.js";
import {
  getFamiliarityColor,
  setFamiliarityColor,
} from "../core/settings/settings-repository.js";
import {
  notifyLearningDataChanged,
  subscribeToLearningData,
} from "../core/learning/learning-sync.js";
import { extractUniqueWords } from "../core/text/text.js";
import type { BackupMaterial, VocabularyRecord } from "../core/models/models.js";
import AiAssistantDialog from "../features/material/components/AiAssistantDialog.vue";
import {
  familiarityColors,
  loadFamiliarityLevels,
  type FamiliarityLevel,
} from "../features/material/familiarity.js";
import MaterialReadingContent from "../features/material/components/MaterialReadingContent.vue";
import WordCard from "../features/material/components/WordCard.vue";

type MaterialViewMode = "reading" | "vocabulary";
interface WordCardController {
  close(): void;
  keepInViewport(): void;
  open(word: string, rect: DOMRect): Promise<void>;
}

const route = useRoute();
const material = ref<BackupMaterial | null>(null);
const materialWords = ref<string[]>([]);
const vocabularyProgress = ref(new Map<string, VocabularyRecord>());
const familiarityLevels = ref<FamiliarityLevel[]>([]);
const familiarityColor = ref("#d86b48");
const activeView = ref<MaterialViewMode>("reading");
const compactLayout = ref(false);
const searchQuery = ref("");
const loading = ref(true);
const errorMessage = ref("");
const actionError = ref("");
const visibleWordLimit = ref(300);
const familiarityHelpOpen = ref(false);
const familiarityLegend = ref<HTMLElement | null>(null);
const materialTitleViewport = ref<HTMLElement | null>(null);
const materialTitleTrack = ref<HTMLElement | null>(null);
const materialTitleOverflowing = ref(false);
const wordCard = ref<WordCardController | null>(null);
const activeWord = ref("");
const wordCardPinned = ref(false);
let loadSequence = 0;
let selectionTimer: number | undefined;
let wordCloseTimer: number | undefined;
let mediaQuery: MediaQueryList | null = null;
let materialTitleResizeObserver: ResizeObserver | null = null;
let unsubscribeFromLearningData: (() => void) | null = null;

const knownWords = computed(() => new Set(
  [...vocabularyProgress.value.values()]
    .filter((record) => record.learned)
    .map((record) => record.word),
));
const knownCount = computed(() =>
  materialWords.value.filter((word) => knownWords.value.has(word)).length);
const visibleWords = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase("en");
  return query
    ? materialWords.value.filter((word) => word.includes(query))
    : materialWords.value;
});
const displayedWords = computed(() => visibleWords.value.slice(0, visibleWordLimit.value));
const readingPanelStyle = computed(() => {
  const colors = familiarityColors(familiarityColor.value);
  return {
    "--familiarity-base-rgb": colors.base,
    "--familiarity-glow-rgb": colors.glow,
  };
});

function materialId(): string {
  return String(route.params.id ?? "");
}

async function refreshKnownWords(): Promise<void> {
  if (!materialId()) return;
  vocabularyProgress.value = await getVocabularyProgress(materialId());
}

async function loadMaterialPage(): Promise<void> {
  const id = materialId();
  const sequence = ++loadSequence;
  wordCard.value?.close();
  loading.value = true;
  errorMessage.value = "";
  actionError.value = "";
  searchQuery.value = "";
  activeView.value = "reading";
  if (!id) {
    loading.value = false;
    errorMessage.value = "找不到這份素材";
    return;
  }

  try {
    const [loadedMaterial, progress, color, levels] = await Promise.all([
      getMaterial(id),
      getVocabularyProgress(id),
      getFamiliarityColor(),
      loadFamiliarityLevels(),
    ]);
    if (sequence !== loadSequence) return;
    material.value = loadedMaterial;
    vocabularyProgress.value = progress;
    familiarityColor.value = color;
    familiarityLevels.value = levels;
    materialWords.value = extractUniqueWords(loadedMaterial.content);
    document.title = `${loadedMaterial.title}｜英文學習庫`;
  } catch {
    if (sequence !== loadSequence) return;
    material.value = null;
    errorMessage.value = "素材可能已被移除，或目前無法讀取。";
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

async function updateWords(words: string[], learned: boolean): Promise<void> {
  actionError.value = "";
  try {
    await setWordsKnown(materialId(), words, learned);
    await refreshKnownWords();
    notifyLearningDataChanged("vocabulary");
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "無法更新單字進度。";
  }
}

function toggleWord(word: string): void {
  void updateWords([word], !knownWords.value.has(word));
}

async function saveFamiliarityColor(): Promise<void> {
  actionError.value = "";
  try {
    await setFamiliarityColor(familiarityColor.value);
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "無法更新熟悉度顏色。";
  }
}

function openWordCard(word: string, rect: DOMRect, key = ""): void {
  if (wordCardPinned.value || document.activeElement?.closest(".word-card")) return;
  window.clearTimeout(wordCloseTimer);
  activeWord.value = key;
  void wordCard.value?.open(word, rect);
}

function scheduleWordCardClose(): void {
  if (!activeWord.value || wordCardPinned.value) return;
  window.clearTimeout(wordCloseTimer);
  wordCloseTimer = window.setTimeout(() => {
    activeWord.value = "";
    wordCard.value?.close();
  }, 120);
}

function keepWordCardOpen(): void {
  window.clearTimeout(wordCloseTimer);
  window.clearTimeout(selectionTimer);
}

function closeWordCard(): void {
  window.clearTimeout(wordCloseTimer);
  activeWord.value = "";
}

function setWordCardPinned(pinned: boolean): void {
  window.clearTimeout(wordCloseTimer);
  wordCardPinned.value = pinned;
}

function handleWordSelection(): void {
  if (document.activeElement?.closest(".word-card")) return;
  const selection = window.getSelection();
  const readingContent = document.querySelector(".reading-content");
  if (
    !selection
    || selection.isCollapsed
    || selection.rangeCount === 0
    || !readingContent?.contains(selection.anchorNode)
  ) return;

  const word = selection.toString().trim().replaceAll("’", "'").toLocaleLowerCase("en");
  if (!/^[a-z]+(?:'[a-z]+)*$/.test(word)) return;
  openWordCard(word, selection.getRangeAt(0).getBoundingClientRect());
}

function scheduleSelectionLookup(): void {
  window.clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(handleWordSelection, 220);
}

function updateCompactLayout(): void {
  compactLayout.value = mediaQuery?.matches ?? false;
  wordCard.value?.keepInViewport();
}

function updateMaterialTitleOverflow(): void {
  const viewport = materialTitleViewport.value;
  const track = materialTitleTrack.value;
  const distance = viewport && track ? Math.max(0, track.scrollWidth - viewport.clientWidth) : 0;
  viewport?.style.setProperty("--title-distance", `${distance}px`);
  materialTitleOverflowing.value = distance > 0;
}

function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || familiarityLegend.value?.contains(target)) return;
  familiarityHelpOpen.value = false;
  if (!wordCardPinned.value && !target.closest(".reading-word, .word-card, .word-item__lookup")) {
    activeWord.value = "";
    wordCard.value?.close();
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  wordCard.value?.close();
  familiarityHelpOpen.value = false;
}

function handleVisibilityChange(): void {
  if (document.visibilityState !== "visible") {
    activeWord.value = "";
    wordCard.value?.close();
    return;
  }
  void refreshKnownWords().catch((error: unknown) => {
    actionError.value = error instanceof Error ? error.message : "無法重新載入單字進度。";
  });
}

function handlePageShow(event: PageTransitionEvent): void {
  if (event.persisted) handleVisibilityChange();
}

watch(() => route.params.id, () => void loadMaterialPage());
watch(searchQuery, () => {
  visibleWordLimit.value = 300;
});
watch(material, async () => {
  await nextTick();
  updateMaterialTitleOverflow();
});

onMounted(() => {
  document.body.classList.add("material-page");
  mediaQuery = window.matchMedia("(max-width: 720px)");
  updateCompactLayout();
  mediaQuery.addEventListener("change", updateCompactLayout);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("selectionchange", scheduleSelectionLookup);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pageshow", handlePageShow);
  window.addEventListener("resize", updateCompactLayout);
  materialTitleResizeObserver = new ResizeObserver(updateMaterialTitleOverflow);
  if (materialTitleViewport.value) materialTitleResizeObserver.observe(materialTitleViewport.value);
  unsubscribeFromLearningData = subscribeToLearningData(() => void refreshKnownWords());
  void loadMaterialPage();
});

onBeforeUnmount(() => {
  loadSequence += 1;
  window.clearTimeout(selectionTimer);
  window.clearTimeout(wordCloseTimer);
  wordCard.value?.close();
  unsubscribeFromLearningData?.();
  mediaQuery?.removeEventListener("change", updateCompactLayout);
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("selectionchange", scheduleSelectionLookup);
  document.removeEventListener("keydown", handleKeydown);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("pageshow", handlePageShow);
  window.removeEventListener("resize", updateCompactLayout);
  materialTitleResizeObserver?.disconnect();
  materialTitleResizeObserver = null;
  document.body.classList.remove("material-page");
});
</script>

<template>
  <main class="page-shell">
    <section v-if="loading" class="empty-state" aria-live="polite">
      <h1>載入素材中…</h1>
    </section>

    <section v-else-if="errorMessage || !material" class="empty-state">
      <h1>找不到這份素材</h1>
      <p>{{ errorMessage }}</p>
      <RouterLink class="button button--primary" :to="{ name: 'home' }">回到首頁</RouterLink>
    </section>

    <template v-else>
      <section class="material-heading" aria-labelledby="material-title">
        <p class="eyebrow">Reading material</p>
        <h1 id="material-title">
          <span
            ref="materialTitleViewport"
            class="material-title-viewport"
            :class="{ 'is-overflowing': materialTitleOverflowing }"
            tabindex="0"
          >
            <span ref="materialTitleTrack" class="material-title-track">{{ material.title }}</span>
          </span>
        </h1>
        <p v-if="material.description" class="lead">{{ material.description }}</p>
      </section>

      <p v-if="actionError" class="form-message is-error" role="alert">{{ actionError }}</p>

      <div class="detail-layout">
        <nav class="material-view-switcher" aria-label="素材檢視">
          <button
            class="material-view-switcher__button"
            :class="{ 'is-active': activeView === 'reading' }"
            type="button"
            :aria-pressed="activeView === 'reading'"
            @click="activeView = 'reading'"
          >
            閱讀內容
          </button>
          <button
            class="material-view-switcher__button"
            :class="{ 'is-active': activeView === 'vocabulary' }"
            type="button"
            :aria-pressed="activeView === 'vocabulary'"
            @click="activeView = 'vocabulary'"
          >
            素材詞彙
          </button>
        </nav>

        <article
          class="panel reading-panel"
          :hidden="compactLayout && activeView !== 'reading'"
          :style="readingPanelStyle"
        >
          <div class="panel__heading">
            <h2>素材內容</h2>
            <p ref="familiarityLegend" class="familiarity-legend">
              <button
                class="familiarity-help"
                type="button"
                aria-describedby="familiarity-tooltip"
                :aria-expanded="familiarityHelpOpen"
                @click="familiarityHelpOpen = !familiarityHelpOpen"
              >
                熟悉度標記
              </button>
              <label class="familiarity-color-picker">
                <span class="sr-only">選擇已學標記顏色</span>
                <span class="familiarity-legend__scale" aria-hidden="true" />
                <input
                  v-model="familiarityColor"
                  type="color"
                  aria-label="選擇已學標記顏色"
                  @change="saveFamiliarityColor"
                >
              </label>
              <span
                id="familiarity-tooltip"
                class="familiarity-tooltip"
                :class="{ 'is-open': familiarityHelpOpen }"
                role="tooltip"
              >
                熟悉度依單字在幾份素材中被你勾選為認識來計算，同一份素材只算一次。
                Lv.0 不顯示效果；從 Lv.1 起，標記的深度、流光亮度、速度與光暈會逐級增強。
                Level 採 RPG 式累進門檻，素材越多，升級需要的素材數也越多。
                點擊旁邊色帶可以自訂標記顏色。
              </span>
            </p>
          </div>
          <MaterialReadingContent
            :active-word="activeWord"
            :blocks="material.contentBlocks"
            :familiarity-levels="familiarityLevels"
            :vocabulary-progress="vocabularyProgress"
            @mouseup="handleWordSelection"
            @dblclick="nextTick(handleWordSelection)"
            @keyup="handleWordSelection"
            @lookup="openWordCard"
            @activate="openWordCard"
            @deactivate="scheduleWordCardClose"
          />
        </article>

        <aside
          class="panel vocabulary-panel"
          :hidden="compactLayout && activeView !== 'vocabulary'"
        >
          <div class="panel__heading">
            <div>
              <h2>素材詞彙</h2>
              <p>已認識 <span>{{ knownCount }}</span> / <span>{{ materialWords.length }}</span> 個</p>
            </div>
          </div>
          <p class="muted">勾選你在這份素材中確定認識的詞彙；每份素材會分開記錄。</p>
          <label class="word-search">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <span class="sr-only">搜尋素材詞彙</span>
            <input v-model="searchQuery" type="search" placeholder="搜尋單字" autocomplete="off">
          </label>
          <div class="bulk-actions" aria-label="批次設定素材詞彙">
            <button class="text-button" type="button" @click="updateWords(materialWords, true)">全選</button>
            <button class="text-button" type="button" @click="updateWords(materialWords, false)">全取消</button>
          </div>
          <div class="word-list">
            <p v-if="visibleWords.length === 0" class="word-list__empty">找不到符合的單字</p>
            <div v-for="word in displayedWords" v-else :key="word" class="word-item">
              <label>
                <input
                  type="checkbox"
                  :checked="knownWords.has(word)"
                  :aria-label="`將 ${word} 標記為已認識`"
                  @change="toggleWord(word)"
                >
              </label>
              <button
                class="word-item__lookup"
                type="button"
                lang="en"
                @click="openWordCard(word, ($event.currentTarget as HTMLElement).getBoundingClientRect())"
              >
                {{ word }}
              </button>
            </div>
            <button
              v-if="displayedWords.length < visibleWords.length"
              class="text-button"
              type="button"
              @click="visibleWordLimit += 300"
            >
              顯示更多（尚有 {{ visibleWords.length - displayedWords.length }} 個）
            </button>
          </div>
        </aside>
      </div>

      <WordCard
        ref="wordCard"
        :style="readingPanelStyle"
        :familiarity-levels="familiarityLevels"
        :known-words="knownWords"
        :vocabulary-progress="vocabularyProgress"
        @close="closeWordCard"
        @enter="keepWordCardOpen"
        @leave="scheduleWordCardClose"
        @pin-change="setWordCardPinned"
        @toggle-known="toggleWord"
      />
      <AiAssistantDialog :material="material" />
    </template>
  </main>
</template>
