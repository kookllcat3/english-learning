<script setup lang="ts">
import { onBeforeUnmount, ref, useId } from "vue";
import { acquirePageScrollLock } from "../page-scroll-lock.js";

const props = withDefaults(defineProps<{
  dialogClass?: string;
  eyebrow: string;
  title: string;
}>(), {
  dialogClass: "",
});
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const titleId = useId();
let releasePageScrollLock: (() => void) | null = null;

function showModal(): void {
  if (!dialog.value || dialog.value.open) return;
  dialog.value.showModal();
  releasePageScrollLock ??= acquirePageScrollLock();
}

function close(): void {
  dialog.value?.close();
}

function closeFromBackdrop(event: MouseEvent): void {
  if (event.target === event.currentTarget) close();
}

function handleClose(): void {
  releasePageScrollLock?.();
  releasePageScrollLock = null;
  emit("close");
}

onBeforeUnmount(() => {
  releasePageScrollLock?.();
  releasePageScrollLock = null;
});

defineExpose({ close, showModal });
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="dialog"
      :class="props.dialogClass"
      :aria-labelledby="titleId"
      @click="closeFromBackdrop"
      @close="handleClose"
    >
      <div class="dialog__body">
        <div class="dialog__heading">
          <div>
            <p class="eyebrow">{{ eyebrow }}</p>
            <h2 :id="titleId">{{ title }}</h2>
          </div>
          <button
            class="icon-button"
            type="button"
            aria-label="關閉"
            autofocus
            @click="close"
          >
            ×
          </button>
        </div>
        <slot />
      </div>
    </dialog>
  </Teleport>
</template>
