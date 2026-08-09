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
  addKnownWordsAndUpdateReadingPosition,
  getMaterial,
  getVocabularyProgress,
} from "../core/learning/learning-repository.js";
import {
  readingProgressIndexForBlocks,
  wordsThroughReadingParagraph,
} from "../core/learning/reading-content.js";
import type { BackupMaterial, VocabularyRecord } from "../core/models/models.js";
import { errorMessage as getErrorMessage } from "../shared/errors.js";
import { useLearningDataRefresh } from "../app/composables/use-learning-data-refresh.js";
import { notifyLearningDataChanged } from "../core/learning/learning-sync.js";
import AiAssistantDialog from "../features/material/components/AiAssistantDialog.vue";
import {
  loadFamiliarityLevels,
  type FamiliarityLevel,
} from "../features/material/familiarity.js";
import MaterialReadingContent from "../features/material/components/MaterialReadingContent.vue";
import WordCard from "../features/material/components/WordCard.vue";
import { useReadingPosition } from "../features/material/composables/use-reading-position.js";
import { useWordCardInteractions } from "../features/material/composables/use-word-card-interactions.js";

const route = useRoute();
const material = ref<BackupMaterial | null>(null);
const vocabularyProgress = ref(new Map<string, VocabularyRecord>());
const familiarityLevels = ref<FamiliarityLevel[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const actionError = ref("");
const activeProgressOperation = ref<"completion" | string | null>(null);
const completionError = ref("");
const readingContainer = ref<HTMLElement | null>(null);
const readingPositionReturnAnchor = ref<HTMLElement | null>(null);
let loadSequence = 0;
let progressSequence = 0;

const hasMaterialWords = computed(() => vocabularyProgress.value.size > 0);
const readingProgressIndex = computed(() => readingProgressIndexForBlocks(
  material.value?.contentBlocks ?? [],
));
const readingProgressBusy = computed(() => activeProgressOperation.value !== null);
const markingAllWords = computed(() => activeProgressOperation.value === "completion");
const savingReadingParagraphKey = computed(() => (
  activeProgressOperation.value === "completion" ? null : activeProgressOperation.value
));
const allMaterialWordsKnown = computed(() => (
  hasMaterialWords.value
  && [...vocabularyProgress.value.values()].every((record) => record.learned)
));
const completionButtonLabel = computed(() => {
  if (markingAllWords.value) return "標記中…";
  if (allMaterialWordsKnown.value) return "本篇單字已全部認識";
  return hasMaterialWords.value ? "完成本次學習" : "沒有可標記的單字";
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
  readingContainer,
  returnActionAnchor: readingPositionReturnAnchor,
  save: saveReadingPosition,
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
  scheduleClose: scheduleWordCardClose,
  scheduleSelectionLookup,
  setPinned: setWordCardPinned,
  wordCard,
} = useWordCardInteractions();

async function loadMaterialPage(): Promise<void> {
  const id = materialId();
  const sequence = ++loadSequence;
  wordCard.value?.close();
  loading.value = true;
  errorMessage.value = "";
  actionError.value = "";
  progressSequence += 1;
  activeProgressOperation.value = null;
  completionError.value = "";
  material.value = null;
  vocabularyProgress.value = new Map();
  currentParagraphKey.value = null;
  if (!id) {
    loading.value = false;
    errorMessage.value = "找不到這份教材";
    return;
  }

  try {
    const [loadedMaterial, progress, levels] = await Promise.all([
      getMaterial(id),
      getVocabularyProgress(id),
      loadFamiliarityLevels(),
    ]);
    if (sequence !== loadSequence) return;
    material.value = loadedMaterial;
    vocabularyProgress.value = progress;
    familiarityLevels.value = levels;
    currentParagraphKey.value = loadedMaterial.readingParagraphKey ?? null;
    document.title = `${loadedMaterial.title}｜英文學習庫`;
  } catch {
    if (sequence !== loadSequence) return;
    material.value = null;
    errorMessage.value = "教材可能已被移除，或目前無法讀取。";
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  handleWordCardPointerDown(event);
}

function unknownWords(words: string[]): string[] {
  return words.filter((word) => !vocabularyProgress.value.get(word)?.learned);
}

async function saveProgress(
  words: string[],
  paragraphKey: string | null | undefined,
  operation: "completion" | string,
): Promise<boolean> {
  if (!material.value || readingProgressBusy.value) return false;
  const id = material.value.id;
  const loadAtStart = loadSequence;
  const sequence = ++progressSequence;
  activeProgressOperation.value = operation;
  actionError.value = "";
  completionError.value = "";
  try {
    await addKnownWordsAndUpdateReadingPosition(
      id,
      unknownWords(words),
      paragraphKey === undefined
        ? { mode: "preserve" }
        : paragraphKey === null
          ? { mode: "clear" }
          : { mode: "set", paragraphKey },
    );
    const [updatedMaterial, updatedProgress] = await Promise.all([
      getMaterial(id),
      getVocabularyProgress(id),
    ]);
    if (sequence !== progressSequence || loadAtStart !== loadSequence || id !== materialId()) {
      return false;
    }
    material.value = updatedMaterial;
    vocabularyProgress.value = updatedProgress;
    currentParagraphKey.value = updatedMaterial.readingParagraphKey ?? null;
    notifyLearningDataChanged("progress");
    return true;
  } catch (error) {
    const message = getErrorMessage(error, "無法更新學習進度，請稍後再試。");
    if (operation === "completion") completionError.value = message;
    else actionError.value = message;
    return false;
  } finally {
    if (sequence === progressSequence) activeProgressOperation.value = null;
  }
}

function saveReadingPosition(paragraphKey: string | null): Promise<boolean> {
  const words = paragraphKey === null
    ? []
    : wordsThroughReadingParagraph(readingProgressIndex.value, paragraphKey);
  return saveProgress(words, paragraphKey, paragraphKey ?? currentParagraphKey.value ?? "reading-position");
}

async function markAllMaterialWordsKnown(): Promise<void> {
  if (
    !material.value
    || readingProgressBusy.value
    || !hasMaterialWords.value
    || allMaterialWordsKnown.value
  ) return;
  await saveProgress(readingProgressIndex.value.orderedUniqueWords, undefined, "completion");
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  wordCard.value?.close();
}

function closeTransientWordCard(): void {
  closeWordCard();
}

async function refreshLearningProgress(): Promise<void> {
  const id = materialId();
  if (!id || loading.value) return;
  try {
    const [updatedMaterial, updatedProgress] = await Promise.all([
      getMaterial(id),
      getVocabularyProgress(id),
    ]);
    if (id !== materialId()) return;
    material.value = updatedMaterial;
    vocabularyProgress.value = updatedProgress;
    currentParagraphKey.value = updatedMaterial.readingParagraphKey ?? null;
  } catch (error) {
    actionError.value = getErrorMessage(error, "無法重新載入單字進度。");
  }
}

useLearningDataRefresh({
  onHidden: closeTransientWordCard,
  refresh: () => void refreshLearningProgress(),
});
watch(() => route.params.id, () => void loadMaterialPage());
onMounted(() => {
  document.body.classList.add("material-page");
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("selectionchange", scheduleSelectionLookup);
  document.addEventListener("keydown", handleKeydown);
  void loadMaterialPage();
});

onBeforeUnmount(() => {
  loadSequence += 1;
  progressSequence += 1;
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
        <div ref="readingPositionReturnAnchor" class="material-heading__actions">
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
      </section>

      <p v-if="actionError" class="form-message is-error" role="alert">{{ actionError }}</p>

      <article ref="readingContainer" class="reading-section">
        <MaterialReadingContent
          :active-word="activeWord"
          :blocks="material.contentBlocks"
          :current-paragraph-key="currentParagraphKey"
          :familiarity-levels="familiarityLevels"
          :reading-progress-busy="readingProgressBusy"
          :saving-reading-paragraph-key="savingReadingParagraphKey"
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

      <footer class="material-completion" aria-label="教材完成操作">
        <div class="material-completion__action">
          <button
            class="button material-completion__button"
            :class="{
              'is-complete': allMaterialWordsKnown,
              'is-loading': markingAllWords,
            }"
            type="button"
            :aria-busy="markingAllWords"
            :disabled="readingProgressBusy || allMaterialWordsKnown || !hasMaterialWords"
            @click="markAllMaterialWordsKnown"
          >
            {{ completionButtonLabel }}
          </button>
          <p v-if="completionError" class="material-completion__status is-error" role="alert">
            {{ completionError }}
          </p>
        </div>
      </footer>

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
