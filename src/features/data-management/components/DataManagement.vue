<script setup lang="ts">
import { computed, ref } from "vue";

import {
  createBackup,
  importBackup,
  previewBackup,
} from "../../../core/learning/learning-repository.js";
import { createBackupPackage, readBackupPackage } from "../../../core/backup/backup-package.js";
import { notifyLearningDataChanged } from "../../../core/learning/learning-sync.js";
import BaseDialog from "../../../shared/components/BaseDialog.vue";
import type { DialogController } from "../../../shared/components/base-dialog.js";
import { errorMessage } from "../../../shared/errors.js";

const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
type BackupStatusKind = "idle" | "pending" | "success" | "error";
type BackupAction = "export" | "import";

const backupFile = ref<HTMLInputElement | null>(null);
const backupStatus = ref("");
const backupStatusKind = ref<BackupStatusKind>("idle");
const activeBackupAction = ref<BackupAction | null>(null);
const isBackupBusy = computed(() => activeBackupAction.value !== null);
const dialog = ref<DialogController | null>(null);
const storageUsage = ref("正在估算目前網站使用的儲存空間…");

function formatBytes(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

async function estimateStorage(): Promise<void> {
  if (!navigator.storage?.estimate) {
    storageUsage.value = "瀏覽器未提供儲存空間估算；資料仍會正常保存在 IndexedDB。";
    return;
  }
  try {
    const estimate = await navigator.storage.estimate();
    storageUsage.value = `目前網站約使用 ${formatBytes(estimate.usage)}；瀏覽器可用額度約 ${formatBytes(estimate.quota)}。`;
  } catch {
    storageUsage.value = "暫時無法估算儲存空間；資料仍會正常保存在 IndexedDB。";
  }
}

function openDialog(): void {
  backupStatus.value = "";
  backupStatusKind.value = "idle";
  dialog.value?.showModal();
  void estimateStorage();
}

async function exportBackup(): Promise<void> {
  backupStatus.value = "";
  backupStatusKind.value = "idle";
  activeBackupAction.value = "export";
  try {
    const backup = await createBackup();
    const blob = await createBackupPackage(backup);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `english-learning-backup-${new Date().toISOString().slice(0, 10)}.elpkg`;
    link.click();
    URL.revokeObjectURL(link.href);
    backupStatus.value = "備份已下載，請妥善保存。";
    backupStatusKind.value = "success";
  } catch (error) {
    backupStatus.value = `備份匯出失敗：${errorMessage(error)}`;
    backupStatusKind.value = "error";
  } finally {
    activeBackupAction.value = null;
  }
}

async function importBackupFile(file: File): Promise<void> {
  backupStatus.value = "正在讀取並驗證備份…";
  backupStatusKind.value = "pending";
  activeBackupAction.value = "import";
  try {
    if (file.size > MAX_BACKUP_BYTES) {
      throw new Error("備份檔案請控制在 100 MB 以內。");
    }
    const isJson = file.type === "application/json" || file.name.toLocaleLowerCase().endsWith(".json");
    const backup = isJson
      ? JSON.parse(await file.text())
      : (await readBackupPackage(file)).backup;
    const preview = await previewBackup(backup);
    const summary = [
      `新增教材 ${preview.newMaterials} 份`,
      `更新教材 ${preview.updatedMaterials} 份`,
      `新增詞彙 ${preview.newWords} 筆`,
      `更新詞彙 ${preview.updatedWords} 筆`,
      `新增教材標記 ${preview.newAnnotations} 筆`,
      `更新教材標記 ${preview.updatedAnnotations} 筆`,
      ...(preview.skippedMaterials.length > 0
        ? [`略過不支援教材 ${preview.skippedMaterials.length} 份`]
        : []),
      ...(preview.skippedLegacyWordNotes > 0
        ? [`略過舊版全域單字筆記 ${preview.skippedLegacyWordNotes} 筆`]
        : []),
    ].join("、");
    if (!window.confirm(`即將匯入備份：${summary}。要繼續嗎？`)) {
      backupStatus.value = "已取消匯入。";
      backupStatusKind.value = "idle";
      return;
    }

    backupStatus.value = "正在寫入資料庫，請不要關閉頁面…";
    const result = await importBackup(preview.plan);
    notifyLearningDataChanged("backup");
    const skippedDetails = [
      ...(result.skippedMaterials.length > 0
        ? [`不支援教材 ${result.skippedMaterials.length} 份`]
        : []),
      ...(result.skippedLegacyWordNotes > 0
        ? [`舊版全域單字筆記 ${result.skippedLegacyWordNotes} 筆`]
        : []),
    ];
    backupStatus.value = skippedDetails.length > 0
      ? `備份已匯入；已略過${skippedDetails.join("、")}。`
      : "備份已匯入。";
    backupStatusKind.value = "success";
  } catch (error) {
    backupStatus.value = `備份匯入失敗：${errorMessage(error)}`;
    backupStatusKind.value = "error";
  } finally {
    activeBackupAction.value = null;
  }
}

async function handleBackupFile(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLInputElement)) return;
  const [file] = event.target.files ?? [];
  if (file) await importBackupFile(file);
  event.target.value = "";
}

function chooseBackupFile(): void {
  backupFile.value?.click();
}
</script>

<template>
  <button
    class="header-icon-button"
    type="button"
    aria-label="開啟資料管理"
    title="資料管理"
    @click="openDialog"
  >
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  </button>

  <BaseDialog
    ref="dialog"
    dialog-class="data-management-dialog"
    eyebrow="Local data"
    title="資料管理"
  >
    <p class="data-management-intro">
      教材與學習進度只保存在目前瀏覽器。定期匯出備份，能避免清除網站資料或更換網址時遺失紀錄。
    </p>
    <p class="storage-usage">{{ storageUsage }}</p>

    <div class="data-actions">
      <section class="data-action-card">
        <div>
          <h3>匯出完整備份</h3>
          <p>下載一份可持續擴充的備份封裝，包含教材、進度、筆記、設定與圖片。</p>
          <button
            class="button button--primary"
            :class="{ 'is-loading': activeBackupAction === 'export' }"
            type="button"
            :aria-busy="activeBackupAction === 'export'"
            :disabled="isBackupBusy"
            @click="exportBackup"
          >
            下載備份
          </button>
        </div>
      </section>
      <section class="data-action-card">
        <div>
          <h3>匯入並合併</h3>
          <p>選擇 `.elpkg` 或舊版 JSON；相同資料保留較新的版本，不會直接清空現有內容。</p>
          <button
            class="button button--secondary"
            :class="{ 'is-loading': activeBackupAction === 'import' }"
            type="button"
            :aria-busy="activeBackupAction === 'import'"
            :disabled="isBackupBusy"
            @click="chooseBackupFile"
          >
            選擇備份
          </button>
          <input
            ref="backupFile"
            type="file"
            accept=".elpkg,.json"
            hidden
            :disabled="isBackupBusy"
            @change="handleBackupFile"
          >
        </div>
      </section>
    </div>

    <aside class="data-capacity-note">
      <strong>大量資料提醒</strong>
      <p>首頁只載入輕量摘要並每頁顯示 12 份，不會讀取所有教材全文。單份教材上限 2 MB；只有完整備份接近數百 MB 時，匯入與匯出可能暫時占用較多記憶體。</p>
    </aside>
    <p
      v-if="backupStatus"
      class="backup-status"
      :class="`backup-status--${backupStatusKind}`"
      :role="backupStatusKind === 'error' ? 'alert' : 'status'"
    >
      {{ backupStatus }}
    </p>
  </BaseDialog>
</template>
