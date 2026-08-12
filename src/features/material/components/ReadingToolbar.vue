<script setup lang="ts">
import {
  BookmarkCheck,
  Copy,
  Eye,
  EyeOff,
  Highlighter,
  NotebookPen,
} from "@lucide/vue";

defineProps<{
  annotationActive: boolean;
  annotationBusy: boolean;
  anchorBusy: boolean;
  anchorExists: boolean;
  copyActive: boolean;
  translationEditActive: boolean;
  hasTranslations: boolean;
  translationsHidden: boolean;
}>();

const emit = defineEmits<{
  activateAnchor: [];
  activateCopy: [];
  activateHighlight: [];
  activateTranslationEdit: [];
  toggleTranslations: [];
}>();
</script>

<template>
  <div class="reading-toolbar" role="toolbar" aria-label="教材閱讀工具">
    <span class="reading-toolbar__actions">
      <button
        class="reading-toolbar__button"
        :class="{
          'is-active': anchorExists,
          'is-loading': anchorBusy,
        }"
        type="button"
        aria-label="回到閱讀書籤"
        :aria-pressed="anchorExists"
        :disabled="anchorBusy || !anchorExists"
        :title="anchorExists ? '回到閱讀書籤' : '尚未設定閱讀書籤'"
        @click.stop="emit('activateAnchor')"
      >
        <BookmarkCheck aria-hidden="true" />
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
        <EyeOff v-if="translationsHidden" aria-hidden="true" />
        <Eye v-else aria-hidden="true" />
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
        <Copy aria-hidden="true" />
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
        <Highlighter aria-hidden="true" />
      </button>
      <button
        class="reading-toolbar__button"
        :class="{ 'is-active': translationEditActive }"
        type="button"
        aria-label="編輯中文解釋"
        :aria-pressed="translationEditActive"
        :title="translationEditActive ? '取消編輯中文解釋' : '編輯中文解釋'"
        @click.stop="emit('activateTranslationEdit')"
      >
        <NotebookPen aria-hidden="true" />
      </button>
    </span>
  </div>
</template>
