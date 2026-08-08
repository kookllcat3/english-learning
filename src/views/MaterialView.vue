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
} from "../core/learning/learning-sync.js";
import { sourceWordsForBlocks } from "../core/learning/reading-content.js";
import type { BackupMaterial, VocabularyRecord } from "../core/models/models.js";
import { errorMessage as getErrorMessage } from "../shared/errors.js";
import { useLearningDataRefresh } from "../app/composables/use-learning-data-refresh.js";
import AiAssistantDialog from "../features/material/components/AiAssistantDialog.vue";
import {
  familiarityColors,
  loadFamiliarityLevels,
  type FamiliarityLevel,
} from "../features/material/familiarity.js";
import MaterialReadingContent from "../features/material/components/MaterialReadingContent.vue";
import WordCard from "../features/material/components/WordCard.vue";
import { useReadingPosition } from "../features/material/composables/use-reading-position.js";
import { useWordCardInteractions } from "../features/material/composables/use-word-card-interactions.js";

type MaterialViewMode = "reading" | "vocabulary";

const INITIAL_VISIBLE_WORD_LIMIT = 300;

const route = useRoute();
const material = ref<BackupMaterial | null>(null);
const materialWords = ref<string[]>([]);
const vocabularyProgress = ref(new Map<string, VocabularyRecord>());
const familiarityLevels = ref<FamiliarityLevel[]>([]);
const familiarityColor = ref("#d86b48");
const activeView = ref<MaterialViewMode>("reading");
const searchQuery = ref("");
const loading = ref(true);
const errorMessage = ref("");
const actionError = ref("");
const visibleWordLimit = ref(INITIAL_VISIBLE_WORD_LIMIT);
const familiarityHelpOpen = ref(false);
const familiarityLegend = ref<HTMLElement | null>(null);
const readingPanel = ref<HTMLElement | null>(null);
const readingPositionReturnAnchor = ref<HTMLElement | null>(null);
let loadSequence = 0;

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

const {
  currentParagraphKey,
  returnActionFloating: readingPositionReturnFloating,
  returnToPosition: returnToReadingPosition,
  showReturnAction: showReadingPositionReturn,
  toggle: toggleReadingParagraph,
} = useReadingPosition({
  actionError,
  activeView,
  materialId,
  readingPanel,
  returnActionAnchor: readingPositionReturnAnchor,
});

const {
  activeWord,
  close: closeWordCard,
  dispose: disposeWordCard,
  handleClosed: handleWordCardClosed,
  handlePointerDown: handleWordCardPointerDown,
  handleSelection: handleWordSelection,
  keepOpen: keepWordCardOpen,
  open: openWordCard,
  openVocabularyWord,
  scheduleClose: scheduleWordCardClose,
  scheduleSelectionLookup,
  setPinned: setWordCardPinned,
  wordCard,
} = useWordCardInteractions();

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
    errorMessage.value = "找不到這份教材";
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
    currentParagraphKey.value = loadedMaterial.readingParagraphKey ?? null;
    materialWords.value = sourceWordsForBlocks(loadedMaterial.contentBlocks);
    document.title = `${loadedMaterial.title}｜英文學習庫`;
  } catch {
    if (sequence !== loadSequence) return;
    material.value = null;
    errorMessage.value = "教材可能已被移除，或目前無法讀取。";
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
    actionError.value = getErrorMessage(error, "無法更新單字進度。");
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
    actionError.value = getErrorMessage(error, "無法更新熟悉度顏色。");
  }
}

function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (!familiarityLegend.value?.contains(target)) familiarityHelpOpen.value = false;
  handleWordCardPointerDown(event);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  wordCard.value?.close();
  familiarityHelpOpen.value = false;
}

function closeTransientWordCard(): void {
  closeWordCard();
}

function refreshLearningProgress(): void {
  void refreshKnownWords().catch((error: unknown) => {
    actionError.value = getErrorMessage(error, "無法重新載入單字進度。");
  });
}

useLearningDataRefresh({
  onHidden: closeTransientWordCard,
  refresh: refreshLearningProgress,
});
watch(() => route.params.id, () => void loadMaterialPage());
watch(searchQuery, () => {
  visibleWordLimit.value = INITIAL_VISIBLE_WORD_LIMIT;
});
onMounted(() => {
  document.body.classList.add("material-page");
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("selectionchange", scheduleSelectionLookup);
  document.addEventListener("keydown", handleKeydown);
  void loadMaterialPage();
});

onBeforeUnmount(() => {
  loadSequence += 1;
  disposeWordCard();
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("selectionchange", scheduleSelectionLookup);
  document.removeEventListener("keydown", handleKeydown);
  document.body.classList.remove("material-page");
});
</script>

<template>
  <main class="page-shell">
    <section v-if="loading" class="empty-state" aria-live="polite">
      <h1>載入教材中…</h1>
    </section>

    <section v-else-if="errorMessage || !material" class="empty-state">
      <h1>找不到這份教材</h1>
      <p>{{ errorMessage }}</p>
      <RouterLink class="button button--primary" :to="{ name: 'home' }">回到首頁</RouterLink>
    </section>

    <template v-else>
      <section class="material-heading" aria-labelledby="material-title">
        <p class="eyebrow">Reading material</p>
        <h1 id="material-title" :title="material.title">{{ material.title }}</h1>
        <p v-if="material.description" class="lead">{{ material.description }}</p>
      </section>

      <p v-if="actionError" class="form-message is-error" role="alert">{{ actionError }}</p>

      <div class="detail-layout">
        <nav class="material-view-switcher" aria-label="教材檢視">
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
            教材詞彙
          </button>
        </nav>

        <article
          ref="readingPanel"
          class="panel reading-panel"
          :hidden="activeView !== 'reading'"
          :style="readingPanelStyle"
        >
          <div class="panel__heading">
            <div ref="readingPositionReturnAnchor" class="reading-panel__title-row">
              <h2>教材內容</h2>
              <button
                v-if="showReadingPositionReturn"
                class="reading-position-return"
                :class="{ 'is-floating': readingPositionReturnFloating }"
                type="button"
                @click="returnToReadingPosition"
              >
                回到閱讀位置
              </button>
            </div>
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
                熟悉度依單字在幾份教材中被你勾選為認識來計算，同一份教材只算一次。
                尚未建立熟悉度時不顯示效果；隨著認識這個單字的教材增加，標記深度、流光與光暈會逐步增強。
                點擊旁邊色帶可以自訂標記顏色。
              </span>
            </p>
          </div>
          <MaterialReadingContent
            :active-word="activeWord"
            :blocks="material.contentBlocks"
            :current-paragraph-key="currentParagraphKey"
            :familiarity-levels="familiarityLevels"
            :vocabulary-progress="vocabularyProgress"
            @mouseup="handleWordSelection"
            @dblclick="nextTick(handleWordSelection)"
            @keyup="handleWordSelection"
            @lookup="openWordCard"
            @activate="openWordCard"
            @deactivate="scheduleWordCardClose"
            @toggle-reading-paragraph="toggleReadingParagraph"
          />
        </article>

        <aside
          class="panel vocabulary-panel"
          :hidden="activeView !== 'vocabulary'"
        >
          <div class="panel__heading">
            <div>
              <h2>教材詞彙</h2>
              <p>已認識 <span>{{ knownCount }}</span> / <span>{{ materialWords.length }}</span> 個</p>
            </div>
          </div>
          <label class="word-search">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <span class="sr-only">搜尋教材詞彙</span>
            <input v-model="searchQuery" type="search" placeholder="搜尋單字" autocomplete="off">
          </label>
          <div class="bulk-actions" aria-label="批次設定教材詞彙">
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
                @click="openVocabularyWord(word, ($event.currentTarget as HTMLElement).getBoundingClientRect())"
              >
                {{ word }}
              </button>
            </div>
            <button
              v-if="displayedWords.length < visibleWords.length"
              class="text-button"
              type="button"
              @click="visibleWordLimit += INITIAL_VISIBLE_WORD_LIMIT"
            >
              顯示更多（尚有 {{ visibleWords.length - displayedWords.length }} 個）
            </button>
          </div>
        </aside>
      </div>

      <WordCard
        ref="wordCard"
        @close="handleWordCardClosed"
        @enter="keepWordCardOpen"
        @leave="scheduleWordCardClose"
        @pin-change="setWordCardPinned"
      />
      <AiAssistantDialog :material="material" />
    </template>
  </main>
</template>
