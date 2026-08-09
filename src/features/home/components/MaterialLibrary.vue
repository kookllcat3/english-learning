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
  getMaterial,
  getMaterialAssets,
  removeMaterial,
  replaceMaterial,
  type MaterialSort,
} from "../../../core/learning/learning-repository.js";
import { createMaterialExport } from "../../../core/materials/material-export.js";
import {
  MATERIAL_FILE_ACCEPT,
  readMaterialFile,
} from "../../../core/materials/material-file-import.js";
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
const exportingMaterialId = ref("");
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
const updateFileInput = ref<HTMLInputElement | null>(null);
const updatingMaterialId = ref("");
const updateStatus = ref("");
let pendingUpdateMaterial: DashboardMaterial | null = null;
let updateTrigger: HTMLButtonElement | null = null;
let searchTimer: number | undefined;
let scrollPositionBeforeSorting: number | undefined;
let dashboardLoadSequence = 0;

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

function materialActionBusy(materialId: string): boolean {
  return [exportingMaterialId.value, removingMaterialId.value, updatingMaterialId.value]
    .includes(materialId);
}

function openEditDialog(material: DashboardMaterial): void {
  renameDialog.value?.open(material.id, material.title);
}

function downloadFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportMaterial(material: DashboardMaterial): Promise<void> {
  if (materialActionBusy(material.id)) return;
  exportingMaterialId.value = material.id;
  try {
    const [completeMaterial, assets] = await Promise.all([
      getMaterial(material.id),
      getMaterialAssets(material.id),
    ]);
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const exported = await createMaterialExport(
      completeMaterial,
      async (assetId) => assetsById.get(assetId),
    );
    downloadFile(exported.blob, exported.fileName);
  } catch (error) {
    window.alert(getErrorMessage(error, "無法匯出這份教材。"));
  } finally {
    exportingMaterialId.value = "";
  }
}

function openUpdateFilePicker(material: DashboardMaterial, event: MouseEvent): void {
  if (materialActionBusy(material.id)) return;
  pendingUpdateMaterial = material;
  updateTrigger = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
  if (updateFileInput.value) {
    updateFileInput.value.value = "";
    updateFileInput.value.click();
  }
}

function finishFileSelection(): void {
  pendingUpdateMaterial = null;
  if (updateFileInput.value) updateFileInput.value.value = "";
  updateTrigger?.focus();
  updateTrigger = null;
}

function cancelMaterialUpdate(): void {
  finishFileSelection();
}

async function updateMaterialFromFile(): Promise<void> {
  const file = updateFileInput.value?.files?.[0];
  const selectedMaterial = pendingUpdateMaterial;
  if (!file || !selectedMaterial) {
    finishFileSelection();
    return;
  }
  const confirmed = window.confirm(
    `要以「${file.name}」更新「${selectedMaterial.title}」嗎？\n\n目前教材的內容與圖片會被取代；仍存在於新正文的已認識單字及共用筆記會保留。`,
  );
  if (!confirmed) {
    finishFileSelection();
    return;
  }

  updatingMaterialId.value = selectedMaterial.id;
  updateStatus.value = `正在更新「${selectedMaterial.title}」…`;
  try {
    const imported = await readMaterialFile(file, (status) => {
      updateStatus.value = status;
    });
    await replaceMaterial(selectedMaterial.id, selectedMaterial.updatedAt, imported);
    updateStatus.value = `「${selectedMaterial.title}」已更新。`;
    notifyLearningDataChanged("materials");
  } catch (error) {
    updateStatus.value = "教材更新失敗。";
    window.alert(getErrorMessage(error, "無法更新這份教材。"));
  } finally {
    updatingMaterialId.value = "";
    finishFileSelection();
  }
}

function preventBusyNavigation(event: MouseEvent, materialId: string): void {
  if (materialActionBusy(materialId)) event.preventDefault();
}

async function loadDashboard(page = pagination.value.currentPage): Promise<boolean> {
  const sequence = ++dashboardLoadSequence;
  const requestedQuery = query.value;
  const requestedSort = sort.value;
  loading.value = true;
  errorMessage.value = "";
  try {
    const dashboard = await getDashboard(page, requestedQuery, requestedSort);
    if (sequence !== dashboardLoadSequence) return false;
    materials.value = dashboard.materials;
    pagination.value = dashboard.pagination;
    dashboardStore.update({
      statistics: dashboard.statistics,
    });
    return true;
  } catch (error) {
    if (sequence === dashboardLoadSequence) errorMessage.value = getErrorMessage(error);
    return false;
  } finally {
    if (sequence === dashboardLoadSequence) loading.value = false;
  }
}

function rememberScrollPositionBeforeSorting(): void {
  scrollPositionBeforeSorting = window.scrollY;
}

async function sortMaterials(): Promise<void> {
  const scrollPosition = scrollPositionBeforeSorting ?? window.scrollY;
  scrollPositionBeforeSorting = undefined;
  const dashboardUpdated = await loadDashboard(1);
  if (!dashboardUpdated) return;
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
          :disabled="materialActionBusy(material.id)"
          @click="openEditDialog(material)"
        >
          <h2>{{ material.title }}</h2>
        </button>
        <div class="material-card__actions">
          <RouterLink
            class="button button--primary"
            :to="{ name: 'material', params: { id: material.id } }"
            :aria-disabled="materialActionBusy(material.id)"
            :tabindex="materialActionBusy(material.id) ? -1 : undefined"
            @click="preventBusyNavigation($event, material.id)"
          >
            開始閱讀
          </RouterLink>
          <button
            class="button button--secondary"
            :class="{ 'is-loading': exportingMaterialId === material.id }"
            type="button"
            :aria-label="`匯出目前教材 ${material.title}`"
            :aria-busy="exportingMaterialId === material.id"
            :title="`匯出目前教材 ${material.title}`"
            :disabled="materialActionBusy(material.id)"
            @click="exportMaterial(material)"
          >
            匯出
          </button>
          <button
            class="button button--secondary"
            :class="{ 'is-loading': updatingMaterialId === material.id }"
            type="button"
            :aria-label="`重新匯入並更新教材 ${material.title}`"
            :aria-busy="updatingMaterialId === material.id"
            :title="`重新匯入並更新教材 ${material.title}`"
            :disabled="materialActionBusy(material.id)"
            @click="openUpdateFilePicker(material, $event)"
          >
            更新
          </button>
          <button
            class="button button--danger"
            :class="{ 'is-loading': removingMaterialId === material.id }"
            type="button"
            :aria-label="`移除教材 ${material.title}`"
            :aria-busy="removingMaterialId === material.id"
            :title="`移除教材 ${material.title}`"
            :disabled="materialActionBusy(material.id)"
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

  <input
    ref="updateFileInput"
    type="file"
    hidden
    :accept="MATERIAL_FILE_ACCEPT"
    @change="updateMaterialFromFile"
    @cancel="cancelMaterialUpdate"
  >
  <p class="sr-only" aria-live="polite">{{ updateStatus }}</p>

  <AddMaterialDialog ref="addDialog" />
  <RenameMaterialDialog ref="renameDialog" />
</template>
