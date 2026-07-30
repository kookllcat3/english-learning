<script setup lang="ts">
import { ref, useId } from "vue";

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

function showModal(): void {
  dialog.value?.showModal();
}

function close(): void {
  dialog.value?.close();
}

function closeFromBackdrop(event: MouseEvent): void {
  if (event.target === event.currentTarget) close();
}

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
      @close="emit('close')"
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
