<script setup lang="ts">
import { ref } from "vue";

import { createMaterial } from "../../../core/learning/learning-repository.js";
import { notifyLearningDataChanged } from "../../../core/learning/learning-sync.js";
import type { ContentBlock, MaterialAssetRecord } from "../../../core/models/models.js";
import BaseDialog from "../../../shared/components/BaseDialog.vue";
import type { DialogController } from "../../../shared/components/base-dialog.js";
import { errorMessage as getErrorMessage } from "../../../shared/errors.js";

interface ImportedMaterial {
  assets: Array<Omit<MaterialAssetRecord, "materialId">>;
  content: string;
  contentBlocks?: ContentBlock[];
}

const dialog = ref<DialogController | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const form = ref<HTMLFormElement | null>(null);
const message = ref("");
const pastedContent = ref("");
const saving = ref(false);

function reset(): void {
  form.value?.reset();
  message.value = "";
  pastedContent.value = "";
}

function close(): void {
  dialog.value?.close();
  reset();
}

function open(): void {
  dialog.value?.showModal();
}

function pastedMaterialFileName(): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-").slice(0, 16);
  return `貼上教材-${timestamp}.txt`;
}

async function readMaterialFile(file: File): Promise<ImportedMaterial> {
  const lowerCaseName = file.name.toLocaleLowerCase();
  const isPdf = file.type === "application/pdf" || lowerCaseName.endsWith(".pdf");
  const isText = file.type === "text/plain" || lowerCaseName.endsWith(".txt");
  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || lowerCaseName.endsWith(".docx");

  if (isText) return { content: await file.text(), contentBlocks: undefined, assets: [] };
  if (isDocx) {
    const { importDocx } = await import("../../../core/importers/docx-importer.js");
    return importDocx(file, (status: string) => {
      message.value = status;
    });
  }
  if (!isPdf) throw new Error("只支援 UTF-8 TXT、文字型 PDF 或 DOCX。");

  message.value = "正在從 PDF 擷取文字…";
  const { extractPdfText } = await import("../../../core/importers/pdf-importer.js");
  return { content: await extractPdfText(file), contentBlocks: undefined, assets: [] };
}

function handlePastedContent(): void {
  if (pastedContent.value.trim() && fileInput.value) fileInput.value.value = "";
}

async function save(): Promise<void> {
  if (!form.value) return;
  message.value = "";
  saving.value = true;
  const formData = new FormData(form.value);
  const fileEntry = formData.get("file");
  const file = fileEntry instanceof File ? fileEntry : null;
  const titleEntry = formData.get("title");
  const title = typeof titleEntry === "string" ? titleEntry : "";
  const normalizedPastedContent = pastedContent.value.trim();

  try {
    if (!normalizedPastedContent && !file?.name) {
      throw new Error("請選擇 TXT、PDF、DOCX，或直接貼上教材內容。");
    }
    message.value = "讀取教材…";
    const imported = normalizedPastedContent
      ? { content: normalizedPastedContent, contentBlocks: undefined, assets: [] }
      : await readMaterialFile(file as File);
    message.value = "儲存教材…";
    await createMaterial({
      title,
      fileName: file?.name || pastedMaterialFileName(),
      description: "",
      ...imported,
    });
    close();
    notifyLearningDataChanged("materials");
  } catch (error) {
    message.value = getErrorMessage(error);
  } finally {
    saving.value = false;
  }
}

defineExpose({ open });
</script>

<template>
  <BaseDialog ref="dialog" eyebrow="New material" title="新增學習教材" @close="reset">
    <form ref="form" class="dialog-form" @submit.prevent="save">
      <label class="field">
        <span>教材名稱（選填）</span>
        <input name="title" maxlength="80" placeholder="未填時使用檔名或自動名稱">
      </label>
      <label class="field">
        <span>選擇 TXT、PDF 或 DOCX</span>
        <input
          ref="fileInput"
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
      <p class="form-message" role="alert">{{ message }}</p>
      <div class="dialog__actions dialog__actions--centered">
        <button
          class="button button--primary"
          :class="{ 'is-loading': saving }"
          type="submit"
          :aria-busy="saving"
          :disabled="saving"
        >
          儲存教材
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
