<script setup lang="ts">
import { computed, ref } from "vue";
import BaseDialog from "../../../shared/components/BaseDialog.vue";

interface DialogController {
  close(): void;
  showModal(): void;
}

type PromptType = "docx" | "text";

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

const dialog = ref<DialogController | null>(null);
const promptType = ref<PromptType>("text");
const status = ref("");
const currentPrompt = computed(() => promptType.value === "text" ? TEXT_PROMPT : DOCX_PROMPT);

function openDialog(): void {
  status.value = "";
  dialog.value?.showModal();
}

function selectPrompt(type: PromptType): void {
  promptType.value = type;
  status.value = "";
}

async function copyPrompt(): Promise<void> {
  try {
    await navigator.clipboard.writeText(currentPrompt.value);
    status.value = "已複製，可貼到你慣用的 AI 工具。";
  } catch {
    status.value = "複製失敗，請手動選取提示詞後按 Ctrl+C。";
  }
}
</script>

<template>
  <button
    class="header-icon-button"
    type="button"
    aria-label="查看素材製作教學"
    title="素材製作教學"
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
    dialog-class="material-guide-dialog"
    eyebrow="Material guide"
    title="如何製作學習素材"
  >
    <ol class="guide-steps">
      <li><strong>選擇想學的英文內容</strong><p>文章、對話、逐字稿或你想練習的句子都可以。</p></li>
      <li><strong>選擇純文字或圖文格式</strong><p>純文字可貼上或存成 UTF-8 TXT；需要圖片時請使用 DOCX。</p></li>
      <li><strong>保持內容聚焦</strong><p>一份素材建議只包含一個主題，篇幅以一次能讀完為準。</p></li>
      <li><strong>上傳到素材庫</strong><p>按頁面右下角的「＋」，選擇檔案或直接貼上文字。</p></li>
    </ol>

    <section class="guide-prompt" aria-labelledby="guide-prompt-title">
      <div class="guide-prompt__heading">
        <div>
          <strong id="guide-prompt-title">素材製作提示詞</strong>
          <p>依輸出格式選擇版本，再貼到你慣用的 AI 工具。</p>
        </div>
        <button class="button button--secondary" type="button" @click="copyPrompt">複製提示詞</button>
      </div>
      <div class="prompt-tabs" role="tablist" aria-label="提示詞版本">
        <button
          class="prompt-tab"
          :class="{ 'is-active': promptType === 'text' }"
          type="button"
          role="tab"
          :aria-selected="promptType === 'text'"
          @click="selectPrompt('text')"
        >
          純文字素材
        </button>
        <button
          class="prompt-tab"
          :class="{ 'is-active': promptType === 'docx' }"
          type="button"
          role="tab"
          :aria-selected="promptType === 'docx'"
          @click="selectPrompt('docx')"
        >
          圖文 DOCX
        </button>
      </div>
      <textarea :value="currentPrompt" readonly rows="22" />
      <p class="copy-status" role="status">{{ status }}</p>
    </section>
  </BaseDialog>
</template>
