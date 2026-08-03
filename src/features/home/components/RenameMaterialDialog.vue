<script setup lang="ts">
import { ref } from "vue";

import { updateMaterial } from "../../../core/learning/learning-repository.js";
import { notifyLearningDataChanged } from "../../../core/learning/learning-sync.js";
import BaseDialog from "../../../shared/components/BaseDialog.vue";
import type { DialogController } from "../../../shared/components/base-dialog.js";
import { errorMessage as getErrorMessage } from "../../../shared/errors.js";

const dialog = ref<DialogController | null>(null);
const form = ref<HTMLFormElement | null>(null);
const materialId = ref("");
const message = ref("");
const title = ref("");

function reset(): void {
  form.value?.reset();
  materialId.value = "";
  message.value = "";
  title.value = "";
}

function close(): void {
  dialog.value?.close();
  reset();
}

function open(id: string, currentTitle: string): void {
  materialId.value = id;
  title.value = currentTitle;
  message.value = "";
  dialog.value?.showModal();
}

async function save(): Promise<void> {
  message.value = "";
  try {
    await updateMaterial(materialId.value, { title: title.value });
    close();
    notifyLearningDataChanged("materials");
  } catch (error) {
    message.value = getErrorMessage(error);
  }
}

defineExpose({ open });
</script>

<template>
  <BaseDialog
    ref="dialog"
    dialog-class="rename-material-dialog"
    eyebrow="Rename material"
    title="重新命名教材"
    @close="reset"
  >
    <form ref="form" class="dialog-form" @submit.prevent="save">
      <label class="field">
        <span>新名稱</span>
        <input v-model="title" required maxlength="80">
      </label>
      <p class="form-message" role="alert">{{ message }}</p>
      <div class="dialog__actions dialog__actions--centered">
        <button class="button button--primary" type="submit">儲存名稱</button>
      </div>
    </form>
  </BaseDialog>
</template>
