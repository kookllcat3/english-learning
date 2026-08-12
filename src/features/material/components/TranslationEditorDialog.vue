<script setup lang="ts">
import { nextTick, ref } from "vue";
import BaseDialog from "../../../shared/components/BaseDialog.vue";
import type { DialogController } from "../../../shared/components/base-dialog.js";

const props = defineProps<{
  saveTranslation: (paragraphKey: string, text: string) => Promise<void>;
}>();

const dialog = ref<DialogController | null>(null);
const editor = ref<HTMLTextAreaElement | null>(null);
const paragraphKey = ref("");
const sourceText = ref("");
const draft = ref("");
const errorMessage = ref("");
const saving = ref(false);

function open(options: { paragraphKey: string; sourceText: string; translation: string }): void {
  paragraphKey.value = options.paragraphKey;
  sourceText.value = options.sourceText;
  draft.value = options.translation;
  errorMessage.value = "";
  dialog.value?.showModal();
  void nextTick(() => editor.value?.focus());
}

async function save(): Promise<void> {
  if (saving.value) return;
  const text = draft.value.trim();
  saving.value = true;
  errorMessage.value = "";
  try {
    await props.saveTranslation(paragraphKey.value, text);
    dialog.value?.close();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "中文解釋儲存失敗。";
  } finally {
    saving.value = false;
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void save();
  }
}

defineExpose({ open });
</script>

<template>
  <BaseDialog
    ref="dialog"
    dialog-class="dialog--standard dialog--form translation-editor-dialog"
    eyebrow="Translation"
    title="編輯中文解釋"
  >
    <form class="translation-editor-form" @submit.prevent="save">
      <div class="translation-editor-source">
        <strong>英文段落</strong>
        <p>{{ sourceText }}</p>
      </div>
      <label class="field">
        中文解釋
        <textarea
          ref="editor"
          v-model="draft"
          rows="5"
          maxlength="2000"
          :disabled="saving"
          aria-describedby="translation-editor-hint"
          @keydown="handleKeydown"
        />
        <small id="translation-editor-hint">
          Ctrl／⌘ + Enter 儲存；內容須含中文字，留空會移除解釋，最多 2,000 字元。
        </small>
      </label>
      <div class="translation-editor-message" aria-live="polite">
        <p v-if="errorMessage" class="form-message is-error" role="alert">{{ errorMessage }}</p>
      </div>
      <div class="dialog__actions dialog__actions--end">
        <button class="button button--primary" type="submit" :disabled="saving">
          {{ saving ? "儲存中…" : "儲存" }}
        </button>
        <button class="button" type="button" :disabled="saving" @click="dialog?.close()">取消</button>
      </div>
    </form>
  </BaseDialog>
</template>
