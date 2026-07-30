# 英文學習庫

一個簡潔、local-first 的英文閱讀與詞彙進度網站。你可以匯入自己的學習素材、標記認識的單字，並從儀表板查看累積成果。

學習資料預設只存在目前瀏覽器的 IndexedDB。網站不需要帳號，也不需要後端資料庫。

## 更新紀錄

### 2026.07.30

這次更新完成前端架構升級：

- 全站介面改由 Vue 3、Vue Router、Pinia 與嚴格 TypeScript 管理，既有 IndexedDB 資料與備份格式維持相容。

## 線上 Demo

[立即開啟英文學習庫](https://kookllcat3.github.io/english-learning/)

網站資料會保存在你目前使用的瀏覽器中。不同裝置不會自動同步，可透過 JSON 備份匯出與匯入。

匯入備份時，同一筆資料會保留 `updatedAt` 較新的版本；時間相同時以使用者剛匯入的備份為準。勾選或取消認識的單字會同步更新素材時間，確保後續備份能正確判斷學習進度的新舊。

## 功能

- 從 UTF-8 純文字檔、文字型 PDF、含圖文的 DOCX 或直接貼上的文字新增素材
- DOCX 內嵌圖片會在瀏覽器內自動轉成 WebP，並依原文件順序顯示
- 閱讀圖片支援響應式顯示
- 自動擷取不重複的英文詞彙
- 每份素材獨立管理「已認識」狀態
- 依單字在不同素材中被標記為認識的份數，套用 RPG 風格熟悉度等級與視覺標記
- 顯示素材完成度、累積詞彙與里程碑
- 素材列表分頁、名稱與說明搜尋、搜尋歷史及排序
- 選取單字後顯示字典卡、音標、英文釋義與發音
- 素材製作指南提供可一鍵複製的 AI 教材生成提示詞，並可切換純文字與圖文版本
- 將素材全文整理成可編輯、可交給任意 AI 服務的學習提示詞
- 匯出及匯入包含圖文素材的版本化 JSON 備份
- 響應式支援桌面與手機版面；自動化瀏覽器測試以 Chromium 為基準

## 快速開始

### Windows

直接雙擊 `start.cmd`。啟動器會優先使用電腦上的 Node.js 20 或更新版本；
如果沒有相容版本，會下載並驗證官方可攜版。第一次啟動或
`package-lock.json` 更新後，也會自動安裝鎖定的套件版本，因此首次執行需要網路。

網站會開在：

```text
http://127.0.0.1:4173
```

### 命令列

```bash
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
匯入解析、備份合併、字典查詢及文字規則，不直接建立或更新頁面 DOM。

## 資料與隱私

- 素材、詞彙與學習紀錄儲存在瀏覽器 IndexedDB。
- PDF 文字在瀏覽器內由 PDF.js 擷取，不會上傳到本專案的伺服器。
- DOCX 文字與圖片在瀏覽器內解析；圖片轉成 WebP 後才寫入 IndexedDB。
- 備份會將 WebP 圖片編碼後放入 JSON，因此不需要保留原始 DOCX 也能還原圖文內容。
- 查詢字典時，只會將選取的英文單字送到 Free Dictionary API；素材全文與學習進度不會送出。
- 字典查詢結果會快取於本機，而且不包含在學習資料備份中。
- 瀏覽器資料依網站來源隔離。協定、網域或 port 改變時，會形成另一份資料空間。

請定期使用頁首的資料管理功能匯出備份。清除瀏覽器網站資料可能會移除所有學習紀錄。

## 素材限制

- TXT：UTF-8 純文字，擷取後內容上限 2 MB
- PDF：檔案上限 20 MB，擷取後文字上限 2 MB
- DOCX：檔案上限 30 MB、最多 50 張圖片；單張 WebP 上限 2 MB。圖片會逐張轉檔，數量上限用來控制瀏覽器記憶體、IndexedDB 儲存與備份容量
- PDF 僅支援具有文字層的文件；掃描圖片需要先以其他工具進行 OCR

## 部署

網站可以部署到 GitHub Pages、Firebase Hosting 或任何靜態網站服務。先執行：

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
4. 不同裝置不會自動同步；請使用 JSON 匯出與匯入移轉資料。

## 專案結構

```text
english-learning/
├─ assets/
│  └─ config/familiarity-levels.json
├─ scripts/start.ps1
├─ src/
│  ├─ app/
│  │  ├─ router.ts
│  │  └─ stores/
│  ├─ core/
│  │  ├─ database/
│  │  ├─ importers/
│  │  ├─ learning/
│  │  ├─ models/
│  │  ├─ services/
│  │  └─ text/
│  ├─ features/
│  │  ├─ home/components/
│  │  └─ material/components/
│  ├─ shared/components/
│  ├─ styles/
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

`src/core` 不依賴 Vue，集中 IndexedDB、匯入、模型與學習規則；`features`
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

修改功能後，至少應在瀏覽器驗證 TXT、PDF、DOCX 素材新增、圖文閱讀、重新命名、刪除、詞彙勾選、字典卡、分頁搜尋及備份還原。

歡迎提交 issue 或 pull request。新增與修改的前端程式必須使用嚴格
TypeScript；持久資料仍維持 local-first，不加入未經產品需求確認的後端資料服務。

## 授權與第三方元件

本專案以 [MIT License](LICENSE) 開源。

PDF 匯入使用 Mozilla PDF.js，DOCX 解析使用 JSZip；單字卡會呼叫 Free Dictionary API。完整來源、授權與使用方式請見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
