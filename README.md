# 英文學習庫

英文學習庫是一個 local-first 的英文閱讀與詞彙學習網站。你可以匯入自己的教材、記錄認識的單字、撰寫單字筆記，並從首頁查看累積成果。

網站不需要帳號或後端資料庫；素材與學習紀錄預設只保存在目前使用的瀏覽器中。

## 更新紀錄

### 2026.08.02

- **正文、翻譯與補充內容分工一致**：純文字與圖文 DOCX 會先辨識英文正文、對應翻譯、標題及雙語補充；只有正文單字會進入熟悉度、單字卡、批次認識、素材詞彙與完成度。`EN`、`WORD POWER`、章節標題及翻譯中的英文不再污染學習統計，正文與其翻譯會共同形成閱讀位置範圍。
- **備份匯入失敗回饋**：匯入會顯示讀取、驗證與寫入進度；圖片資產會以 ArrayBuffer 寫入 IndexedDB，讀取時仍相容舊版 Blob。每份教材會獨立驗證，圖片、大小、欄位或閱讀位置損壞的教材會自動略過並提示數量；備份封裝、共用資料或 IndexedDB 交易失敗則會以可讀錯誤告知，並保留匯入前資料不變。
- **段落閱讀控制**：每段原文尾端提供「整段標記為認識」與「目前閱讀位置」按鈕；閱讀位置可取消、跨段互斥，重新開啟素材後仍會保留。標記範圍只涵蓋英文正文，不包含中文解釋。只要素材設有閱讀位置，「素材內容」標題旁便會顯示「回到閱讀位置」；匯入備份時也會確認標記確實指向現有段落，避免損壞標記留下無效按鈕。
- **釘選卡片收合更直覺**：單字卡釘選後，點擊或觸碰面板外的空白區域會先取消釘選，再依原有非釘選規則自然收合；點擊另一個單字則會直接切換，面板內的發音、認識狀態與筆記操作不受影響。

## 線上 Demo

[立即開啟英文學習庫](https://kookllcat3.github.io/english-learning/)

Demo 的資料只會保存在目前的瀏覽器中，不同裝置不會自動同步。請使用頁首的「資料管理」匯出 `.elpkg` 備份；舊版 JSON 備份仍可直接匯入。

## 主要功能

- 匯入 UTF-8 TXT、文字型 PDF、含圖文 DOCX，或直接貼上文字建立素材。
- DOCX 圖片會在瀏覽器內轉成 WebP，依原文件順序及目前螢幕寬度顯示。
- 自動整理素材英文正文中的詞彙，排除標題、翻譯與雙語補充，再分別記錄每份素材的認識狀態、完成度與全域熟悉度。
- 素材庫支援每頁 12 份、關鍵字搜尋、搜尋歷史，以及加入時間、名稱和完成度排序。
- 桌面停留單字 0.6 秒後開啟單字卡；觸控、雙擊或框選文字也能直接開啟。卡片提供發音、認識狀態、釘選及 Markdown 筆記；釘選後點擊或觸碰面板外空白處會先取消釘選，再依非釘選規則收合，點擊另一個單字則立即換卡。
- 每段英文正文尾端可一次將該段單字標記為認識，或設定目前閱讀位置；全篇最多標記一段，也可清除全部標記。已標記範圍會以高對比書籤與段落標線涵蓋英文正文，不包含中文解釋；設定閱讀位置後，可隨時從「素材內容」標題旁快速回到該段，清除標記後按鈕才會隱藏。
- 直接對應英文正文的中文解釋可逐段模糊，桌面停留 0.6 秒或手機觸碰後可切換該段顯示狀態；標題、雙語索引及 `WORD POWER` 等補充內容保持一般可選取文字。
- 素材製作指南提供純文字與圖文 DOCX 兩種 AI 教材提示詞；閱讀頁也能產生包含素材全文的學習提示詞。
- `.elpkg` 完整備份包含素材、圖片、學習進度、閱讀位置、單字筆記及設定；匯入會先驗證、預覽並合併資料，不會直接清空現有內容。單份教材的圖片、欄位或閱讀位置錯誤會在確認前列為略過，不影響其他教材匯入；封裝結構、共用詞彙／設定資料或 IndexedDB 寫入失敗，才會拒絕整份備份。舊標記若指向現在辨識為標題或補充內容的既有段落，會安全清除。
- 響應式支援桌面、平板與手機版面，並保留鍵盤操作及減少動態效果偏好。

## 快速開始

### Windows

下載或 clone 專案後，直接雙擊 `start.cmd`。啟動器會優先使用電腦上的 Node.js 20 或更新版本；如果沒有相容版本，會下載並驗證官方可攜版。第一次啟動或 `package-lock.json` 更新後，也會自動安裝鎖定的套件版本，因此首次執行需要網路。

網站會開在：

```text
http://127.0.0.1:4173
```

### 命令列

```bash
git clone https://github.com/kookllcat3/english-learning.git
cd english-learning
npm ci
npm start
```

本機開發由 Vite 提供服務；Vue、TypeScript 與其他工具均使用
`package-lock.json` 中的精確版本。

網站由單一 Vue App 管理，使用 Hash History 導航：

- `#/`：素材庫首頁
- `#/materials/:id`：閱讀素材

舊的 `material.html?id=...` 網址會自動轉到對應的 Hash route。

跨元件的畫面／工作階段狀態由 Pinia 管理；素材、圖片與學習進度不會
複製進 store，仍透過 Repository 寫入 IndexedDB。

所有使用者介面均由 Vue 元件管理；框架無關模組只負責 IndexedDB、
匯入解析、備份合併、單字筆記及文字規則，不直接建立或更新頁面 DOM。

## 資料與隱私

- 素材、詞彙與學習紀錄儲存在瀏覽器 IndexedDB。
- PDF 文字在瀏覽器內由 PDF.js 擷取，不會上傳到本專案的伺服器。
- DOCX 文字與圖片在瀏覽器內解析；圖片轉成 WebP 後才寫入 IndexedDB。
- 備份封裝將 WebP 圖片以獨立資產檔保存，並透過 manifest 與 SHA-256 checksum 驗證完整性；不需要保留原始 DOCX 也能還原圖文內容。
- 單字發音使用瀏覽器 `SpeechSynthesis`，不會將單字送到外部字典服務。
- Markdown 單字筆記儲存在本機 IndexedDB，並包含在完整 `.elpkg` 備份封裝中。
- 匯入備份時會先顯示新增與更新摘要；同一筆資料保留較新的版本，時間相同時採用這次匯入的內容。
- 瀏覽器資料依網站來源隔離。協定、網域或 port 改變時，會形成另一份資料空間。

請定期使用頁首的資料管理功能匯出備份。清除瀏覽器網站資料可能會移除所有學習紀錄。

## 素材限制

- TXT：UTF-8 純文字，擷取後內容上限 2 MB
- PDF：檔案上限 20 MB，擷取後文字上限 2 MB
- DOCX：檔案上限 30 MB、最多 50 張圖片；單張 WebP 上限 2 MB。圖片會逐張轉檔，數量上限用來控制瀏覽器記憶體、IndexedDB 儲存與備份容量
- PDF 僅支援具有文字層的文件；掃描圖片需要先以其他工具進行 OCR
- 備份：介面接受 100 MB 以內的 `.elpkg` 或舊版 JSON；封裝內容還會檢查項目數、單檔及累積解壓容量，超限、驗證或 IndexedDB 寫入失敗時會顯示錯誤，無法支援的個別教材則自動略過並顯示數量

## 部署

公開倉庫使用 GitHub Actions 自動部署到 GitHub Pages：

- pull request 合併前會執行型別檢查、單元測試與正式建置，但不會部署。
- `main` 更新或從 Actions 手動執行 workflow 時，通過相同檢查後會發布 `dist/`。
- 部署使用 GitHub Pages artifact，不需要 `gh-pages` 分支，也不會使用 Firebase。

第一次啟用時，請在 GitHub repository 的 **Settings → Pages → Build and deployment**
將 Source 設為 **GitHub Actions**。後續由
`.github/workflows/deploy-pages.yml` 自動處理。

若要部署到其他靜態網站服務，先執行：

```bash
npm run build
```

公開部署 `dist/` 內的建置結果。

```text
dist/
```

部署時請注意：

1. 使用固定的 HTTPS 網址，避免 IndexedDB 因來源改變而變成另一份資料。
2. 伺服器必須能以 JavaScript 相容的 MIME type 提供 `.mjs` 檔案。
3. `start.cmd` 與 `scripts/` 只供本機啟動，靜態託管不需要上傳。
4. 不同裝置不會自動同步；請使用 `.elpkg` 匯出與匯入移轉資料，舊 JSON 備份仍可匯入。

## 專案結構

```text
english-learning/
├─ .github/workflows/deploy-pages.yml
├─ assets/
│  └─ config/familiarity-levels.json
├─ scripts/start.ps1
├─ src/
│  ├─ app/
│  │  ├─ router.ts
│  │  └─ stores/
│  ├─ core/
│  │  ├─ backup/
│  │  ├─ database/
│  │  ├─ importers/
│  │  ├─ learning/
│  │  ├─ settings/
│  │  ├─ services/
│  │  ├─ text/
│  │  └─ models.ts
│  ├─ features/
│  │  ├─ home/components/
│  │  └─ material/components/
│  ├─ shared/components/
│  ├─ styles/
│  ├─ types/
│  ├─ vendor/
│  │  ├─ jszip/
│  │  └─ pdfjs/
│  ├─ views/
│  ├─ App.vue
│  ├─ main.ts
│  └─ legacy-material-redirect.ts
├─ tests/
│  ├─ unit/{app,core,features}/
│  └─ e2e/{application,deployment,quality}/
├─ index.html
├─ material.html
├─ playwright.config.ts
├─ playwright.production.config.ts
├─ tsconfig.json
├─ vitest.config.ts
├─ vite.config.ts
└─ start.cmd
```

`src/core` 不依賴 Vue，集中 IndexedDB、備份、匯入、模型與學習規則；`features`
放各頁功能元件；`shared` 只放跨功能共用元件。`assets` 僅保留需要以固定
網址直接讀取的靜態設定，第三方離線程式庫則集中在 `src/vendor` 由 Vite 打包。

## 開發與檢查

```bash
npm run check
```

`npm run check` 會依序執行嚴格 TypeScript 型別檢查、Vitest 單元測試與
正式建置。第一次執行端到端測試前，安裝鎖定版本所需的 Chromium：

```bash
npx playwright install chromium
npm run test:e2e
```

Playwright 會以桌面 Chromium 與 390 px 窄螢幕執行同一套核心流程，
驗證單一 Vue App、Vue Router、IndexedDB 學習進度持久化、跨分頁同步、
離線資料寫入、舊版資料庫升級、備份往返、axe WCAG 2.0/2.1 A 與 AA
自動檢查基線，以及舊網址轉址。自動檢查不能取代完整的人工無障礙測試。
需要一次執行全部自動檢查時使用：

```bash
npm run check:full
```

`check:full` 也會啟動正式 `dist` 預覽，驗證 Hash route、舊網址入口與正式
bundle。效能門檻為首次內容繪製低於 2 秒、大型素材進入詞彙列表低於
2 秒、彈窗開啟回應低於 120 ms、長提示詞分頁切換低於 150 ms；大型詞彙
列表初始最多渲染 300 筆，使用者可再分批顯示。彈窗使用合成層友善的
短過場，素材窄版面板隔離版面計算；圖文素材只為接近可視區域的圖片建立
Blob URL，離開頁面時會立即釋放。

網站資料操作是 local-first：頁面與必要程式已載入後，即使暫時離線仍可
勾選並保存學習進度；重新載入網站本身仍需要靜態主機或瀏覽器快取可用。

修改功能後，至少應在瀏覽器驗證 TXT、PDF、DOCX 素材新增、圖文閱讀、重新命名、刪除、詞彙勾選、單字卡、分頁搜尋及備份還原。

歡迎提交 issue 或 pull request。新增與修改的前端程式必須使用嚴格
TypeScript；持久資料仍維持 local-first，不加入未經產品需求確認的後端資料服務。

## 授權與第三方元件

本專案以 [MIT License](LICENSE) 開源。

PDF 匯入使用 Mozilla PDF.js，DOCX 解析使用 JSZip。完整來源、授權與使用方式請見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
