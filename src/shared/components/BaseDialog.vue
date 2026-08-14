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

function closeFromBackdropPointerDown(event: PointerEvent): void {
  if (event.button === 0 && event.target === event.currentTarget) close();
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
      @pointerdown="closeFromBackdropPointerDown"
      @close="handleClose"
    >
      <div class="dialog__body">
        <div class="dialog__heading">
          <div class="dialog__heading-copy">
            <p class="eyebrow">{{ eyebrow }}</p>
            <h2 :id="titleId">{{ title }}</h2>
          </div>
          <button
            class="dialog__close"
            type="button"
            aria-label="關閉"
            autofocus
            @click="close"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div class="dialog__content">
          <slot />
        </div>
        <div v-if="$slots['footer-meta']" class="dialog__footer-meta">
          <slot name="footer-meta" />
        </div>
      </div>
    </dialog>
  </Teleport>
</template>
