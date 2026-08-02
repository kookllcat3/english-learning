<script setup lang="ts">
import { ref } from "vue";
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

const backupFile = ref<HTMLInputElement | null>(null);
const backupStatus = ref("");
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
  dialog.value?.showModal();
  void estimateStorage();
}

async function exportBackup(): Promise<void> {
  backupStatus.value = "";
  try {
    const backup = await createBackup();
    const blob = await createBackupPackage(backup);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `english-learning-backup-${new Date().toISOString().slice(0, 10)}.elpkg`;
    link.click();
    URL.revokeObjectURL(link.href);
    backupStatus.value = "備份已下載，請妥善保存。";
  } catch (error) {
    backupStatus.value = errorMessage(error);
  }
}

async function importBackupFile(file: File): Promise<void> {
  backupStatus.value = "";
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
      `新增素材 ${preview.newMaterials} 份`,
      `更新素材 ${preview.updatedMaterials} 份`,
      `新增詞彙 ${preview.newWords} 筆`,
      `更新詞彙 ${preview.updatedWords} 筆`,
    ].join("、");
    if (!window.confirm(`即將匯入備份：${summary}。要繼續嗎？`)) return;

    await importBackup(backup);
    notifyLearningDataChanged("backup");
    backupStatus.value = "備份已匯入。";
  } catch (error) {
    backupStatus.value = errorMessage(error);
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
      素材與學習進度只保存在目前瀏覽器。定期匯出備份，能避免清除網站資料或更換網址時遺失紀錄。
    </p>
    <p class="storage-usage">{{ storageUsage }}</p>

    <div class="data-actions">
      <section class="data-action-card">
        <span class="data-action-card__icon" aria-hidden="true">↓</span>
        <div>
          <h3>匯出完整備份</h3>
          <p>下載一份可持續擴充的備份封裝，包含素材、進度、筆記、設定與圖片。</p>
          <button class="button button--primary" type="button" @click="exportBackup">下載備份</button>
        </div>
      </section>
      <section class="data-action-card">
        <span class="data-action-card__icon" aria-hidden="true">↑</span>
        <div>
          <h3>匯入並合併</h3>
          <p>選擇 `.elpkg` 或舊版 JSON；相同資料保留較新的版本，不會直接清空現有內容。</p>
          <button class="button button--secondary" type="button" @click="chooseBackupFile">選擇備份</button>
          <input ref="backupFile" type="file" hidden @change="handleBackupFile">
        </div>
      </section>
    </div>

    <aside class="data-capacity-note">
      <strong>大量資料提醒</strong>
      <p>首頁只載入輕量摘要並每頁顯示 12 份，不會讀取所有素材全文。單份素材上限 2 MB；只有完整備份接近數百 MB 時，匯入與匯出可能暫時占用較多記憶體。</p>
    </aside>
    <p class="backup-status" role="status">{{ backupStatus }}</p>
  </BaseDialog>
</template>
