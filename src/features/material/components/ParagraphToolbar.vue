<script setup lang="ts">
const props = defineProps<{
  annotationBusy: boolean;
  annotationMode: "erase" | "highlight" | null;
  copyStatus: "error" | "success" | null;
  hasTranslation: boolean;
  isCurrentReadingPosition: boolean;
  readingPositionDisabled: boolean;
  readingPositionLoading: boolean;
  isTranslationHidden: boolean;
}>();

const emit = defineEmits<{
  copy: [];
  selectAnnotationTool: [mode: "erase" | "highlight" | null];
  toggleReadingPosition: [];
  toggleTranslation: [];
}>();

function activateAnnotationTool(): void {
  if (props.annotationMode === null) emit("selectAnnotationTool", "highlight");
}
</script>

<template>
  <div class="paragraph-toolbar" role="group" aria-label="段落閱讀工具" @pointerdown.stop>
    <span class="paragraph-toolbar__actions">
      <button
        class="paragraph-toolbar__button"
        :class="{
          'is-active': isCurrentReadingPosition,
          'is-loading': readingPositionLoading,
        }"
        type="button"
        aria-label="標記目前閱讀段落"
        title="標記目前閱讀段落"
        :aria-busy="readingPositionLoading"
        :aria-pressed="isCurrentReadingPosition"
        :disabled="readingPositionDisabled"
        @click.stop="emit('toggleReadingPosition')"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 4h12v16l-6-4-6 4V4Z" />
        </svg>
      </button>
      <button
        v-if="hasTranslation"
        class="paragraph-toolbar__button"
        type="button"
        :aria-label="isTranslationHidden ? '顯示這段中文翻譯' : '隱藏這段中文翻譯'"
        :aria-pressed="isTranslationHidden"
        :title="isTranslationHidden ? '顯示這段中文翻譯' : '隱藏這段中文翻譯'"
        @click.stop="emit('toggleTranslation')"
      >
        <svg v-if="isTranslationHidden" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M3 3 21 21" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11.8 11.8 0 0 1 12 5c5 0 8.5 3.5 10 7a14 14 0 0 1-3.1 4.8M6.2 6.2A13.8 13.8 0 0 0 2 12c1.5 3.5 5 7 10 7a11.8 11.8 0 0 0 2.1-.2" />
        </svg>
        <svg v-else aria-hidden="true" viewBox="0 0 24 24">
          <path d="M2 12c1.5-3.5 5-7 10-7s8.5 3.5 10 7c-1.5 3.5-5 7-10 7S3.5 15.5 2 12Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      </button>
      <button
        class="paragraph-toolbar__button"
        :class="{
          'is-copy-error': copyStatus === 'error',
          'is-copy-success': copyStatus === 'success',
        }"
        type="button"
        :aria-label="copyStatus === 'success' ? '已複製整段英文' : '複製整段英文'"
        :title="copyStatus === 'success' ? '已複製整段英文' : '複製整段英文'"
        @click.stop="emit('copy')"
      >
        <svg v-if="copyStatus === 'success'" aria-hidden="true" viewBox="0 0 24 24">
          <path d="m5 12 4 4L19 6" />
        </svg>
        <svg v-else aria-hidden="true" viewBox="0 0 24 24">
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      </button>
      <button
        class="paragraph-toolbar__button"
        :class="{ 'is-active': annotationMode !== null }"
        type="button"
        aria-label="開啟螢光筆工具"
        title="螢光筆工具"
        :aria-pressed="annotationMode !== null"
        :disabled="annotationBusy"
        @click.stop="activateAnnotationTool"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m5 16 8-8 3 3-8 8H5v-3Z" />
          <path d="m14 7 2-2 3 3-2 2M4 20h8" />
        </svg>
      </button>
    </span>
    <span
      v-if="copyStatus"
      class="paragraph-toolbar__feedback"
      :class="{ 'is-error': copyStatus === 'error' }"
      :role="copyStatus === 'error' ? 'alert' : 'status'"
    >{{ copyStatus === "success" ? "已複製" : "複製失敗" }}</span>
  </div>
</template>
