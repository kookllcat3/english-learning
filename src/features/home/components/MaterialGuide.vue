<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import {
  getMaterialGuidePrompt,
  MATERIAL_GUIDE_PROMPT_MAX_LENGTH,
  setMaterialGuidePrompt,
  type MaterialGuidePromptType,
} from "../../../core/settings/settings-repository.js";
import { APP_VERSION } from "../../../core/app/app-version.js";
import BaseDialog from "../../../shared/components/BaseDialog.vue";
import type { DialogController } from "../../../shared/components/base-dialog.js";

type PromptType = MaterialGuidePromptType;

const TEXT_PROMPT = `你是一位專業的英語教材編輯。請依照我提供的主題或原始內容，製作一份內容充實、可直接匯入英文學習網站的純文字教材。

製作規格：
1. 先判斷學習者程度、使用情境與主題範圍；資料不足時採用「初級至中級、生活實用英文」。
2. 除非我指定數量，至少提供 12 個、最多 20 個具代表性的學習單元；不可只給少量示例。
3. 每個單元必須包含：英文標題或關鍵詞、2 至 4 句自然實用的英文、簡短繁體中文翻譯或說明。
4. 主題適合時，補充常用搭配詞、例句、簡短對話、易混淆點或記憶提示，避免每個單元只有一句定義。
5. 英文必須自然且符合指定程度；修正明顯拼字與文法錯誤，但不要改變原始內容的核心意思。
6. 使用清楚的標題、段落和換行；不要使用 Markdown 表格、HTML、圖片語法或圖片位置說明。
7. 直接輸出可儲存為 UTF-8 .txt 的完整教材，不要加開場白、製作說明或結尾客套話。
8. 輸出前自行檢查：單元數量達標、沒有重複湊數、每個單元內容完整、整份教材可以獨立使用。

我的需求：
- 主題或原始內容：[請填寫]
- 學習者程度：[可留空]
- 希望的單元數量：[可留空，預設 12 至 20]
- 特別想練習的能力或情境：[可留空]`;

const DOCX_PROMPT = `你是一位專業的英語教材編輯與圖文文件設計師。請依照我提供的主題，直接製作並交付一份可下載的 .docx 英語學習教材；不要只在聊天訊息中貼出內容，也不要只描述圖片應放在哪裡。

內容規格：
1. 先判斷學習者程度、使用情境與主題範圍；資料不足時採用「初級至中級、生活實用英文」。
2. 除非我指定數量，至少提供 12 個、最多 20 個具代表性的學習單元；不可只製作 5 至 6 個示例。
3. 每個單元必須包含：英文標題或關鍵詞、2 至 4 句自然實用的英文、簡短繁體中文翻譯或說明。
4. 主題適合時，補充常用搭配詞、例句、簡短對話、特徵比較、易混淆點或記憶提示，使教材不只是圖鑑式的一句介紹。
5. 內容不可重複湊數；各單元應涵蓋不同且具代表性的項目，並以適合學習的順序排列。

圖片與 DOCX 規格：
6. 每個學習單元配置 1 張與內容直接相關、容易辨識的圖片，並將圖片實際嵌入 DOCX，不可使用外部網址、佔位框或「此處放圖片」文字。
7. 圖片緊接在所屬單元的標題或說明附近；文字與圖片必須依正常閱讀順序排列。
8. 為每張圖片設定簡短明確的替代文字（alt text），並可加入一句簡短圖說；替代文字應說明圖片主體，不要寫「一張圖片」。
9. 圖片以清楚、單一主體、背景不干擾學習為原則；不要把文字直接畫進圖片。
10. 使用一般 DOCX 段落、標題與內嵌圖片，不要用文字方塊、頁首頁尾、浮動圖層、SVG、表格排版或巨集。
11. 控制圖片尺寸一致且適合閱讀，避免模糊、裁切主體或讓單張圖片占滿整頁。

交付與自檢：
12. 最終只交付一份可下載的 .docx 檔案；檔名使用清楚的繁體中文或英文主題名稱。
13. 輸出前逐項檢查：單元數量達標、每個單元都有完整文字與實際嵌入圖片、圖片順序正確、沒有缺圖或重複圖、DOCX 可正常開啟。
14. 如果目前工具確實無法建立並附上含內嵌圖片的 DOCX，請直接說明限制，不要改成交付純文字、圖片建議清單或內容不足的替代品。

我的需求：
- 主題：[請填寫]
- 學習者程度：[可留空]
- 希望的單元數量：[可留空，預設 12 至 20]
- 圖片風格或其他限制：[可留空]`;

void DOCX_PROMPT;

const dialog = ref<DialogController | null>(null);
const status = ref("");
const prompts = ref<Record<PromptType, string>>({
  text: TEXT_PROMPT,
});
const visiblePrompt = ref(TEXT_PROMPT);
const isLoadingPrompts = ref(false);
const promptSaveTimers: Partial<Record<PromptType, number>> = {};
const pendingPromptSaves = new Set<Promise<void>>();

function openDialog(): void {
  status.value = "";
  dialog.value?.showModal();
  void loadPrompts();
}

async function loadPrompts(): Promise<void> {
  isLoadingPrompts.value = true;
  try {
    await Promise.all(pendingPromptSaves);
    const text = await getMaterialGuidePrompt("text", TEXT_PROMPT);
    prompts.value = { text };
    visiblePrompt.value = prompts.value.text;
  } catch {
    prompts.value = { text: TEXT_PROMPT };
    visiblePrompt.value = prompts.value.text;
    status.value = "無法讀取已儲存的提示詞，目前顯示預設內容。";
  } finally {
    isLoadingPrompts.value = false;
  }
}

function updatePrompt(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  visiblePrompt.value = value;
  prompts.value.text = value;
  schedulePromptSave("text", value);
}

function schedulePromptSave(type: PromptType, value: string): void {
  window.clearTimeout(promptSaveTimers[type]);
  promptSaveTimers[type] = window.setTimeout(() => {
    delete promptSaveTimers[type];
    startPromptSave(type, value);
  }, 400);
}

function startPromptSave(type: PromptType, value: string): void {
  const request = persistPrompt(type, value);
  pendingPromptSaves.add(request);
  void request.finally(() => pendingPromptSaves.delete(request));
}

async function persistPrompt(type: PromptType, value: string): Promise<void> {
  try {
    await setMaterialGuidePrompt(type, value);
    status.value = `${type === "text" ? "純文字" : "圖文"}提示詞已儲存。`;
  } catch {
    status.value = "提示詞儲存失敗，請確認內容不是空白且未超過 20,000 個字元。";
  }
}

function flushPromptSaves(): void {
  (Object.keys(promptSaveTimers) as PromptType[]).forEach((type) => {
    window.clearTimeout(promptSaveTimers[type]);
    delete promptSaveTimers[type];
    startPromptSave(type, prompts.value[type]);
  });
}

async function copyPrompt(): Promise<void> {
  if (!visiblePrompt.value.trim()) {
    status.value = "提示詞不可留白。";
    return;
  }
  try {
    await navigator.clipboard.writeText(visiblePrompt.value);
    status.value = "已複製，可貼到你慣用的 AI 工具。";
  } catch {
    status.value = "複製失敗，請手動選取提示詞後按 Ctrl+C。";
  }
}

onBeforeUnmount(() => {
  flushPromptSaves();
});
</script>

<template>
  <button
    class="header-icon-button"
    type="button"
    aria-label="查看教材製作教學"
    title="教材製作教學"
    @click="openDialog"
  >
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9a2.4 2.4 0 1 1 3.6 2.1c-.9.5-1.4 1.1-1.4 2.2" />
      <path d="M12 17h.01" />
    </svg>
  </button>

  <BaseDialog
    ref="dialog"
    dialog-class="dialog--standard dialog--workspace material-guide-dialog"
    eyebrow="Material guide"
    title="如何製作學習教材"
    @close="flushPromptSaves"
  >
    <ol class="guide-steps">
      <li><strong>選擇想學的英文內容</strong><p>文章、對話、逐字稿或你想練習的句子都可以。</p></li>
      <li><strong>準備純文字內容</strong><p>請直接貼上教材內容，或選擇 UTF-8 TXT 檔案。</p></li>
      <li><strong>保持內容聚焦</strong><p>一份教材建議只包含一個主題，篇幅以一次能讀完為準。</p></li>
      <li><strong>上傳到教材庫</strong><p>按頁面右下角的「＋」，選擇檔案或直接貼上文字。</p></li>
    </ol>

    <section class="guide-prompt" aria-labelledby="guide-prompt-title">
      <div class="guide-prompt__heading">
        <div class="guide-prompt__title-row">
          <strong id="guide-prompt-title">AI 教材生成提示詞</strong>
          <button
            class="text-button guide-prompt__copy"
            type="button"
            aria-label="複製提示詞"
            title="複製提示詞"
            @click="copyPrompt"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <rect x="8" y="8" width="11" height="11" rx="2" />
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
            </svg>
            <span>複製提示詞</span>
          </button>
        </div>
      </div>
      <textarea
        :value="visiblePrompt"
        aria-label="純文字教材生成提示詞"
        :disabled="isLoadingPrompts"
        :maxlength="MATERIAL_GUIDE_PROMPT_MAX_LENGTH"
        rows="22"
        @input="updatePrompt"
      />
      <p class="copy-status" role="status">
        <span class="copy-status__version">v{{ APP_VERSION }}</span>
        <span v-if="status" class="copy-status__message">{{ status }}</span>
      </p>
    </section>
  </BaseDialog>
</template>
