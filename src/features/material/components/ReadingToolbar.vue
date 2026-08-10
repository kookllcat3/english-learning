<script setup lang="ts">
defineProps<{
  annotationActive: boolean;
  annotationBusy: boolean;
  anchorBusy: boolean;
  anchorExists: boolean;
  anchorSelectionActive: boolean;
  copyActive: boolean;
  hasTranslations: boolean;
  translationsHidden: boolean;
}>();

const emit = defineEmits<{
  activateAnchor: [];
  activateCopy: [];
  activateHighlight: [];
  toggleTranslations: [];
}>();
</script>

<template>
  <div class="reading-toolbar" role="toolbar" aria-label="教材閱讀工具">
    <span class="reading-toolbar__actions">
      <button
        class="reading-toolbar__button"
        :class="{
          'is-active': anchorExists || anchorSelectionActive,
          'is-loading': anchorBusy,
        }"
        type="button"
        :aria-label="anchorExists ? '回到閱讀書籤' : anchorSelectionActive ? '取消設定閱讀書籤' : '設定閱讀書籤'"
        :aria-pressed="anchorExists || anchorSelectionActive"
        :disabled="anchorBusy"
        :title="anchorExists ? '回到閱讀書籤' : anchorSelectionActive ? '取消設定閱讀書籤' : '設定閱讀書籤'"
        @click.stop="emit('activateAnchor')"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 4h12v16l-6-4-6 4V4Z" />
        </svg>
      </button>
      <button
        v-if="hasTranslations"
        class="reading-toolbar__button"
        type="button"
        :aria-label="translationsHidden ? '顯示全部中文翻譯' : '隱藏全部中文翻譯'"
        :aria-pressed="translationsHidden"
        :title="translationsHidden ? '顯示全部中文翻譯' : '隱藏全部中文翻譯'"
        @click.stop="emit('toggleTranslations')"
      >
        <svg v-if="translationsHidden" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M3 3 21 21" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11.8 11.8 0 0 1 12 5c5 0 8.5 3.5 10 7a14 14 0 0 1-3.1 4.8M6.2 6.2A13.8 13.8 0 0 0 2 12c1.5 3.5 5 7 10 7a11.8 11.8 0 0 0 2.1-.2" />
        </svg>
        <svg v-else aria-hidden="true" viewBox="0 0 24 24">
          <path d="M2 12c1.5-3.5 5-7 10-7s8.5 3.5 10 7c-1.5 3.5-5 7-10 7S3.5 15.5 2 12Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      </button>
      <button
        class="reading-toolbar__button"
        :class="{ 'is-active': copyActive }"
        type="button"
        aria-label="複製英文段落"
        :aria-pressed="copyActive"
        :title="copyActive ? '取消複製段落' : '複製英文段落'"
        @click.stop="emit('activateCopy')"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      </button>
      <button
        class="reading-toolbar__button"
        :class="{ 'is-active': annotationActive }"
        type="button"
        aria-label="螢光筆"
        :aria-pressed="annotationActive"
        :disabled="annotationBusy"
        :title="annotationActive ? '關閉螢光筆' : '開啟螢光筆'"
        @click.stop="emit('activateHighlight')"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m5 16 8-8 3 3-8 8H5v-3Z" />
          <path d="m14 7 2-2 3 3-2 2M4 20h8" />
        </svg>
      </button>
    </span>
  </div>
</template>
