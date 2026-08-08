<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
} from "vue";
import { RouterLink } from "vue-router";
import {
  getDashboard,
  removeMaterial,
  type MaterialSort,
} from "../../../core/learning/learning-repository.js";
import {
  clearSearchHistory,
  getSearchHistory,
  rememberSearchQuery,
} from "../../../core/settings/settings-repository.js";
import {
  notifyLearningDataChanged,
} from "../../../core/learning/learning-sync.js";
import AsyncState from "../../../shared/components/AsyncState.vue";
import { errorMessage as getErrorMessage } from "../../../shared/errors.js";
import { useDashboardStore } from "../../../app/stores/dashboard.js";
import { useLearningDataRefresh } from "../../../app/composables/use-learning-data-refresh.js";
import AddMaterialDialog from "./AddMaterialDialog.vue";
import RenameMaterialDialog from "./RenameMaterialDialog.vue";

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
type DashboardMaterial = Dashboard["materials"][number];

const SEARCH_DELAY_MS = 180;
const dashboardStore = useDashboardStore();

const addDialog = ref<InstanceType<typeof AddMaterialDialog> | null>(null);
const renameDialog = ref<InstanceType<typeof RenameMaterialDialog> | null>(null);
const errorMessage = ref("");
const history = ref<string[]>([]);
const historyOpen = ref(false);
const loading = ref(true);
const materials = ref<DashboardMaterial[]>([]);
const pagination = ref({
  currentPage: 1,
  endItem: 0,
  pageCount: 1,
  query: "",
  startItem: 0,
  totalItems: 0,
  totalLibraryItems: 0,
});
const query = ref("");
const removingMaterialId = ref("");
const searchInput = ref<HTMLInputElement | null>(null);
const sort = ref<MaterialSort>("newest");
let searchTimer: number | undefined;
let scrollPositionBeforeSorting: number | undefined;

const hasActiveFilter = computed(() => Boolean(pagination.value.query));

const emptyState = computed(() => ({
  description: hasActiveFilter.value
    ? "試試其他關鍵字，或清除搜尋條件。"
    : "新增第一份文字檔，替自己的英文學習歷程留下起點。",
  title: hasActiveFilter.value ? "找不到符合的教材" : "還沒有學習教材",
}));

function completionPercentage(material: DashboardMaterial): number {
  return Math.round(material.completion * 100);
}

function openEditDialog(material: DashboardMaterial): void {
  renameDialog.value?.open(material.id, material.title);
}

async function loadDashboard(page = pagination.value.currentPage): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const dashboard = await getDashboard(page, query.value, sort.value);
    materials.value = dashboard.materials;
    pagination.value = dashboard.pagination;
    dashboardStore.update({
      statistics: dashboard.statistics,
    });
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function rememberScrollPositionBeforeSorting(): void {
  scrollPositionBeforeSorting = window.scrollY;
}

async function sortMaterials(): Promise<void> {
  const scrollPosition = scrollPositionBeforeSorting ?? window.scrollY;
  scrollPositionBeforeSorting = undefined;
  await loadDashboard(1);
  await nextTick();
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
  window.scrollTo(window.scrollX, scrollPosition);
}

function scheduleSearch(): void {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => loadDashboard(1), SEARCH_DELAY_MS);
}

async function submitSearch(): Promise<void> {
  window.clearTimeout(searchTimer);
  await Promise.all([
    loadDashboard(1),
    rememberSearchQuery(query.value).then(loadSearchHistory),
  ]);
}

async function clearSearch(): Promise<void> {
  query.value = "";
  historyOpen.value = false;
  await loadDashboard(1);
  await nextTick();
  searchInput.value?.focus();
}

async function loadSearchHistory(): Promise<void> {
  history.value = await getSearchHistory();
}

async function clearHistory(): Promise<void> {
  await clearSearchHistory();
  await loadSearchHistory();
}

async function useHistoryQuery(historyQuery: string): Promise<void> {
  query.value = historyQuery;
  historyOpen.value = false;
  await loadDashboard(1);
}

async function removeSelectedMaterial(material: DashboardMaterial): Promise<void> {
  if (!window.confirm(`確定要移除「${material.title}」嗎？學習詞彙紀錄會保留。`)) return;

  removingMaterialId.value = material.id;
  try {
    await removeMaterial(material.id);
    notifyLearningDataChanged("materials");
  } catch (error) {
    window.alert(getErrorMessage(error));
  } finally {
    removingMaterialId.value = "";
  }
}

function handleDocumentClick(event: MouseEvent): void {
  if (!(event.target instanceof Element) || !event.target.closest(".library-tools")) {
    historyOpen.value = false;
  }
}

function openAddDialog(): void {
  addDialog.value?.open();
}

useLearningDataRefresh({ refresh: () => void loadDashboard() });

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
  void Promise.all([loadSearchHistory(), loadDashboard()]);
});

onUnmounted(() => {
  window.clearTimeout(searchTimer);
  document.removeEventListener("click", handleDocumentClick);
});
</script>

<template>
  <section class="content-section" aria-label="教材列表">
    <div class="section-heading">
      <div class="library-heading">
        <p class="eyebrow">Library</p>
      </div>
      <button
        class="add-material-button add-material-button--inline"
        type="button"
        aria-label="新增教材"
        title="新增教材"
        @click="openAddDialog"
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>

    <div class="library-tools">
      <form class="material-search" role="search" @submit.prevent="submitSearch">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <label class="sr-only" for="material-search-input">搜尋教材名稱或說明</label>
        <input
          id="material-search-input"
          ref="searchInput"
          v-model="query"
          type="search"
          placeholder="搜尋教材名稱或說明"
          autocomplete="off"
          @input="scheduleSearch"
        >
        <button class="sr-only" type="submit">搜尋</button>
        <button
          v-if="query"
          class="search-tool-button"
          type="button"
          aria-label="清除搜尋內容"
          title="清除搜尋內容"
          @click="clearSearch"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
        </button>
        <button
          class="search-tool-button"
          type="button"
          aria-label="開啟搜尋歷史"
          :aria-expanded="historyOpen"
          aria-controls="search-history-panel"
          title="搜尋歷史"
          @click.stop="historyOpen = !historyOpen"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" />
            <path d="M4 4v4.6h4.6M12 8v4l2.8 1.7" />
          </svg>
        </button>
      </form>

      <fieldset
        class="material-sort-options"
        @pointerdown="rememberScrollPositionBeforeSorting"
        @keydown="rememberScrollPositionBeforeSorting"
      >
        <legend class="sr-only">教材排序方式</legend>
        <label><input v-model="sort" type="radio" value="newest" @change="sortMaterials">最新加入</label>
        <label><input v-model="sort" type="radio" value="oldest" @change="sortMaterials">最早加入</label>
        <label><input v-model="sort" type="radio" value="title" @change="sortMaterials">名稱</label>
        <label><input v-model="sort" type="radio" value="progress" @change="sortMaterials">完成度</label>
      </fieldset>

      <section
        v-show="historyOpen"
        id="search-history-panel"
        class="tool-popover history-panel"
        aria-label="搜尋歷史"
      >
        <div class="history-heading">
          <strong>搜尋歷史</strong>
          <button type="button" @click="clearHistory">清除全部</button>
        </div>
        <p v-if="history.length === 0" class="history-empty">還沒有搜尋紀錄。</p>
        <button
          v-for="historyQuery in history"
          v-else
          :key="historyQuery"
          type="button"
          @click="useHistoryQuery(historyQuery)"
        >
          {{ historyQuery }}
        </button>
      </section>
    </div>

    <div class="material-grid" aria-live="polite" :aria-busy="loading">
      <AsyncState
        v-if="loading && materials.length === 0"
        message="正在載入學習歷程…"
      />
      <AsyncState
        v-else-if="errorMessage"
        title="無法載入本機資料"
        :message="errorMessage"
      />
      <AsyncState
        v-else-if="materials.length === 0"
        :title="emptyState.title"
        :message="emptyState.description"
      />
      <article v-for="material in materials" v-else :key="material.id" class="material-card">
        <div
          class="material-card__progress"
          :aria-label="`已認識 ${material.knownCount} / ${material.wordCount} 個詞彙`"
        >
          <span>{{ material.knownCount }} / {{ material.wordCount }}</span>
          <span>{{ completionPercentage(material) }}%</span>
        </div>
        <progress
          class="material-progress"
          max="100"
          :value="completionPercentage(material)"
        >
          {{ completionPercentage(material) }}%
        </progress>
        <button
          class="material-card__title-button"
          type="button"
          :aria-label="`重新命名 ${material.title}`"
          :title="material.title"
          @click="openEditDialog(material)"
        >
          <h2>{{ material.title }}</h2>
        </button>
        <div class="material-card__actions">
          <RouterLink
            class="button button--primary"
            :to="{ name: 'material', params: { id: material.id } }"
          >
            開始閱讀
          </RouterLink>
          <button
            class="button button--danger"
            :class="{ 'is-loading': removingMaterialId === material.id }"
            type="button"
            :aria-busy="removingMaterialId === material.id"
            :disabled="removingMaterialId === material.id"
            @click="removeSelectedMaterial(material)"
          >
            移除
          </button>
        </div>
      </article>
    </div>

    <nav
      v-if="pagination.pageCount > 1"
      class="pagination"
      aria-label="教材列表分頁"
    >
      <button
        class="text-button"
        type="button"
        :disabled="pagination.currentPage <= 1"
        @click="loadDashboard(pagination.currentPage - 1)"
      >
        上一頁
      </button>
      <span>第 {{ pagination.currentPage }} / {{ pagination.pageCount }} 頁</span>
      <button
        class="text-button"
        type="button"
        :disabled="pagination.currentPage >= pagination.pageCount"
        @click="loadDashboard(pagination.currentPage + 1)"
      >
        下一頁
      </button>
    </nav>

  </section>

  <AddMaterialDialog ref="addDialog" />
  <RenameMaterialDialog ref="renameDialog" />
</template>
