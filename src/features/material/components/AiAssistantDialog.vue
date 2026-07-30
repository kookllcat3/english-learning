<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { BackupMaterial } from "../../../core/models/models.js";
import BaseDialog from "../../../shared/components/BaseDialog.vue";
import { usePageActionsStore } from "../../../app/stores/page-actions.js";

interface DialogController {
  close(): void;
  showModal(): void;
}

const GUIDE_STEPS = [
  "開啟你慣用的 AI 服務，建立一個新對話。",
  "若要口說練習，先開啟語音模式。",
  "回到這裡生成並複製完整學習提示詞。",
  "貼到新對話並送出。",
];

const QUICK_PROMPT = `你是我的英文學習助教。

規則：
1. 以我在下方提供的學習素材為主要範圍。
2. 不要假裝素材中包含未提供的資訊。
3. 如果我的問題超出素材範圍，請先明確提醒我。
4. 可以補充理解素材所必要的英文知識，但要清楚標示為補充說明。
5. 預設使用繁體中文輔助，英文練習內容除外。
6. 進行口說練習時，每次只提出一個問題，等我回答後再繼續。
7. 不要聲稱已修改網站中的詞彙或學習進度。

收到素材後，先簡短說明主題，再讓我選擇：
A. 口說練習
B. 閱讀理解
C. 單字練習
D. 文法與句型
E. 自由提問`;

const RECOVERY_PROMPT = `請重新讀取本次對話中的學習素材。
接下來仍以該素材為主要範圍，不要依賴先前對素材的摘要或印象。
如果問題超出素材，請明確提醒我。`;

const props = defineProps<{ material: BackupMaterial }>();
const pageActions = usePageActionsStore();
const dialog = ref<DialogController | null>(null);
const prompt = ref(QUICK_PROMPT);
const status = ref("");
const statusIsError = ref(false);

const materialCharacters = computed(() => props.material.content.length.toLocaleString());
const materialSizeMessage = computed(() =>
  props.material.content.length > 50_000
    ? `素材全文約 ${materialCharacters.value} 個字元，內容較長，部分 AI 服務可能無法一次完整處理。`
    : `你可以修改提示詞；複製時會自動加入素材全文（約 ${materialCharacters.value} 個字元）。`);

function materialBlock(): string {
  return `素材標題：${props.material.title}

學習素材開始：
<<<MATERIAL
${props.material.content}
MATERIAL
學習素材結束。`;
}

function showStatus(message: string, isError = false): void {
  status.value = message;
  statusIsError.value = isError;
}

async function copy(text: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showStatus(successMessage);
  } catch {
    showStatus("複製失敗，請確認瀏覽器已允許剪貼簿權限。", true);
  }
}

watch(
  () => pageActions.aiAssistantRequest,
  () => {
    prompt.value = QUICK_PROMPT;
    showStatus("");
    dialog.value?.showModal();
  },
);
</script>

<template>
  <BaseDialog
    ref="dialog"
    dialog-class="ai-assistant-dialog"
    eyebrow="AI learning assistant"
    title="啟用 AI 學習"
  >
    <p class="ai-dialog-intro">提示詞與素材只在本機產生，不會自動傳送或修改學習進度。</p>
    <section class="ai-guide" aria-labelledby="ai-guide-title">
      <strong id="ai-guide-title">使用步驟</strong>
      <ol>
        <li v-for="step in GUIDE_STEPS" :key="step">{{ step }}</li>
      </ol>
    </section>
    <label class="field ai-prompt-field">
      <span>可編輯提示詞</span>
      <textarea v-model="prompt" rows="10" />
      <small :class="{ 'is-warning': props.material.content.length > 50_000 }">
        {{ materialSizeMessage }}
      </small>
    </label>
    <details class="ai-recovery">
      <summary>AI 忘記或偏離素材時怎麼辦？</summary>
      <p>複製以下提醒貼回同一個對話，要求 AI 重新讀取素材。</p>
      <pre>{{ RECOVERY_PROMPT }}</pre>
      <button
        class="text-button"
        type="button"
        @click="copy(RECOVERY_PROMPT, '重新提醒已複製。')"
      >
        複製重新提醒
      </button>
    </details>
    <p class="copy-status" :class="{ 'is-error': statusIsError }" role="status">{{ status }}</p>
    <div class="ai-actions">
      <button
        class="button button--primary"
        type="button"
        @click="copy(`${prompt.trim()}\n\n${materialBlock()}`, '學習提示詞已生成並複製，可貼到任意 AI 服務。')"
      >
        生成並複製完整學習提示詞
      </button>
    </div>
  </BaseDialog>
</template>
