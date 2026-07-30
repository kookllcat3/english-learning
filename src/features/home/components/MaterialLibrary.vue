<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  type Ref,
} from "vue";
import { RouterLink } from "vue-router";
import {
  createMaterial,
  getDashboard,
  removeMaterial,
  updateMaterial,
} from "../../../core/learning/learning-repository.js";
import {
  clearSearchHistory,
  getSearchHistory,
  rememberSearchQuery,
} from "../../../core/settings/settings-repository.js";
import {
  notifyLearningDataChanged,
  subscribeToLearningData,
} from "../../../core/learning/learning-sync.js";
import type {
  ContentBlock,
  MaterialAssetRecord,
  MaterialRecord,
} from "../../../core/models/models.js";
import AsyncState from "../../../shared/components/AsyncState.vue";
import BaseDialog from "../../../shared/components/BaseDialog.vue";
import { useDashboardStore } from "../../../app/stores/dashboard.js";

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
type DashboardMaterial = Dashboard["materials"][number];

interface ImportedMaterial {
  assets: Array<Omit<MaterialAssetRecord, "materialId">>;
  content: string;
  contentBlocks?: ContentBlock[];
}

interface DialogController {
  close(): void;
  showModal(): void;
}

const SEARCH_DELAY_MS = 180;
const dashboardStore = useDashboardStore();

const addDialog = ref<DialogController | null>(null);
const addFile = ref<HTMLInputElement | null>(null);
const addForm = ref<HTMLFormElement | null>(null);
const addMessage = ref("");
const editDialog = ref<DialogController | null>(null);
const editForm = ref<HTMLFormElement | null>(null);
const editMessage = ref("");
const editTitle = ref("");
const editingMaterialId = ref("");
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
  status: "all",
  totalItems: 0,
  totalLibraryItems: 0,
});
const query = ref("");
const removingMaterialId = ref("");
const pastedContent = ref("");
const savingMaterial = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);
const sort = ref("newest");
let searchTimer: number | undefined;
let scrollPositionBeforeSorting: number | undefined;
let unsubscribeFromLearningData = () => {};

const hasActiveFilter = computed(() => Boolean(pagination.value.query)
  || pagination.value.status !== "all");

const libraryCount = computed(() => {
  if (hasActiveFilter.value) {
    return `找到 ${pagination.value.totalItems} 份，共 ${pagination.value.totalLibraryItems} 份素材`;
  }
  if (pagination.value.totalItems === 0) return "目前沒有素材";
  return `共 ${pagination.value.totalItems} 份，目前顯示第 ${pagination.value.startItem}–${pagination.value.endItem} 份`;
});

const emptyState = computed(() => ({
  description: hasActiveFilter.value
    ? "試試其他關鍵字，或清除搜尋條件。"
    : "新增第一份文字檔，替自己的英文學習歷程留下起點。",
  title: hasActiveFilter.value ? "找不到符合的素材" : "還沒有學習素材",
}));

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : "發生未知錯誤。";
}

function completionPercentage(material: DashboardMaterial): number {
  return Math.round(material.completion * 100);
}

function closeFormDialog(
  dialog: DialogController | null,
  form: HTMLFormElement | null,
  message: Ref<string>,
): void {
  if (!dialog || !form) return;
  dialog.close();
  form.reset();
  message.value = "";
}

function closeAddDialog(): void {
  closeFormDialog(addDialog.value, addForm.value, addMessage);
  pastedContent.value = "";
}

function resetAddDialog(): void {
  addForm.value?.reset();
  addMessage.value = "";
  pastedContent.value = "";
}

function openEditDialog(material: MaterialRecord): void {
  editingMaterialId.value = material.id;
  editTitle.value = material.title;
  editMessage.value = "";
  editDialog.value?.showModal();
}

function closeEditDialog(): void {
  closeFormDialog(editDialog.value, editForm.value, editMessage);
  editingMaterialId.value = "";
  editTitle.value = "";
}

function resetEditDialog(): void {
  editForm.value?.reset();
  editMessage.value = "";
  editingMaterialId.value = "";
  editTitle.value = "";
}

function pastedMaterialFileName(): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-").slice(0, 16);
  return `貼上素材-${timestamp}.txt`;
}

async function readMaterialFile(file: File): Promise<ImportedMaterial> {
  const lowerCaseName = file.name.toLocaleLowerCase();
  const isPdf = file.type === "application/pdf" || lowerCaseName.endsWith(".pdf");
  const isText = file.type === "text/plain" || lowerCaseName.endsWith(".txt");
  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || lowerCaseName.endsWith(".docx");

  if (isText) return { content: await file.text(), contentBlocks: undefined, assets: [] };
  if (isDocx) {
    await import("../../../vendor/jszip/jszip.min.js");
    const { importDocx } = await import("../../../core/importers/docx-importer.js");
    return importDocx(file, (status: string) => {
      addMessage.value = status;
    });
  }
  if (!isPdf) throw new Error("只支援 UTF-8 TXT、文字型 PDF 或 DOCX。");

  addMessage.value = "正在從 PDF 擷取文字…";
  const { extractPdfText } = await import("../../../core/importers/pdf-importer.js");
  return { content: await extractPdfText(file), contentBlocks: undefined, assets: [] };
}

function handlePastedContent(): void {
  if (pastedContent.value.trim() && addFile.value) addFile.value.value = "";
}

async function addMaterial(): Promise<void> {
  addMessage.value = "";
  savingMaterial.value = true;
  if (!addForm.value) return;
  const formData = new FormData(addForm.value);
  const fileEntry = formData.get("file");
  const file = fileEntry instanceof File ? fileEntry : null;
  const titleEntry = formData.get("title");
  const title = typeof titleEntry === "string" ? titleEntry : "";
  const normalizedPastedContent = pastedContent.value.trim();

  try {
    if (!normalizedPastedContent && !file?.name) {
      throw new Error("請選擇 TXT、PDF、DOCX，或直接貼上素材內容。");
    }
    addMessage.value = "讀取素材…";
    const imported = normalizedPastedContent
      ? { content: normalizedPastedContent, contentBlocks: undefined, assets: [] }
      : await readMaterialFile(file as File);
    addMessage.value = "儲存素材…";
    await createMaterial({
      title,
      fileName: file?.name || pastedMaterialFileName(),
      description: "",
      ...imported,
    });
    closeAddDialog();
    notifyLearningDataChanged("materials");
  } catch (error) {
    addMessage.value = displayError(error);
  } finally {
    savingMaterial.value = false;
  }
}

async function renameMaterial(): Promise<void> {
  editMessage.value = "";
  try {
    await updateMaterial(editingMaterialId.value, { title: editTitle.value });
    closeEditDialog();
    notifyLearningDataChanged("materials");
  } catch (error) {
    editMessage.value = displayError(error);
  }
}

async function loadDashboard(page = pagination.value.currentPage): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const dashboard = await getDashboard(page, query.value, "all", sort.value);
    materials.value = dashboard.materials;
    pagination.value = dashboard.pagination;
    dashboardStore.update({
      milestone: dashboard.milestone,
      statistics: dashboard.statistics,
    });
  } catch (error) {
    errorMessage.value = displayError(error);
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
    window.alert(displayError(error));
  } finally {
    removingMaterialId.value = "";
  }
}

function handleDocumentClick(event: MouseEvent): void {
  if (!(event.target instanceof Element) || !event.target.closest(".library-tools")) {
    historyOpen.value = false;
  }
}

function handlePageShow(event: PageTransitionEvent): void {
  if (event.persisted) void loadDashboard();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "visible") void loadDashboard();
}

function openAddDialog(): void {
  addDialog.value?.showModal();
}

onMounted(() => {
  unsubscribeFromLearningData = subscribeToLearningData(() => void loadDashboard());
  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("pageshow", handlePageShow);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  void Promise.all([loadSearchHistory(), loadDashboard()]);
});

onUnmounted(() => {
  window.clearTimeout(searchTimer);
  unsubscribeFromLearningData();
  document.removeEventListener("click", handleDocumentClick);
  window.removeEventListener("pageshow", handlePageShow);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>

<template>
  <section class="content-section" aria-labelledby="materials-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Library</p>
        <h2 id="materials-title">素材列表</h2>
        <p class="library-count">{{ libraryCount }}</p>
      </div>
    </div>

    <div class="library-tools">
      <form class="material-search" role="search" @submit.prevent="submitSearch">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <label class="sr-only" for="material-search-input">搜尋素材名稱或說明</label>
        <input
          id="material-search-input"
          ref="searchInput"
          v-model="query"
          type="search"
          placeholder="搜尋素材名稱或說明"
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
        <legend class="sr-only">素材排序方式</legend>
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
            type="button"
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
      aria-label="素材列表分頁"
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

    <button
      class="add-material-button add-material-button--floating"
      type="button"
      aria-label="新增素材"
      title="新增素材"
      @click="openAddDialog"
    >
      <span aria-hidden="true">+</span>
    </button>
  </section>

  <BaseDialog
    ref="addDialog"
    eyebrow="New material"
    title="新增學習素材"
    @close="resetAddDialog"
  >
    <form ref="addForm" class="dialog-form" @submit.prevent="addMaterial">
        <label class="field">
          <span>素材名稱（選填）</span>
          <input name="title" maxlength="80" placeholder="未填時使用檔名或自動名稱">
        </label>
        <label class="field">
          <span>選擇 TXT、PDF 或 DOCX</span>
          <input
            ref="addFile"
            name="file"
            type="file"
            :disabled="Boolean(pastedContent.trim())"
            accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          >
          <small>DOCX 可包含文字與圖片，原檔上限 30 MB、最多 50 張圖片；圖片會在瀏覽器逐張轉成 WebP。限制圖片數量是為了避免轉檔時占用過多記憶體、瀏覽器儲存空間及備份容量。TXT 上限 2 MB；文字型 PDF 上限 20 MB。</small>
        </label>
        <div class="input-divider"><span>或</span></div>
        <label class="field">
          <span>直接貼上文字</span>
          <textarea
            v-model="pastedContent"
            name="content"
            rows="8"
            placeholder="將英文文章、對話或其他學習內容貼在這裡"
            @input="handlePastedContent"
          />
          <small>開始貼上後會改用這裡的內容；若要切換回檔案，請先清空文字。</small>
        </label>

        <p class="form-message" role="alert">{{ addMessage }}</p>
        <div class="dialog__actions dialog__actions--centered">
          <button class="button button--primary" type="submit" :disabled="savingMaterial">
            儲存素材
          </button>
        </div>
    </form>
  </BaseDialog>

  <BaseDialog
    ref="editDialog"
    dialog-class="rename-material-dialog"
    eyebrow="Rename material"
    title="重新命名素材"
    @close="resetEditDialog"
  >
    <form ref="editForm" class="dialog-form" @submit.prevent="renameMaterial">
        <label class="field">
          <span>新名稱</span>
          <input v-model="editTitle" required maxlength="80">
        </label>

        <p class="form-message" role="alert">{{ editMessage }}</p>
        <div class="dialog__actions dialog__actions--centered">
          <button class="button button--primary" type="submit">儲存名稱</button>
        </div>
    </form>
  </BaseDialog>
</template>
