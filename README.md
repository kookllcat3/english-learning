# 英文學習庫

英文學習庫是一個 local-first 的英文閱讀與詞彙學習網站。你可以匯入自己的教材、記錄認識的單字、撰寫單字筆記，並從首頁查看累積成果。

網站不需要帳號或後端資料庫；教材與學習紀錄預設只保存在目前使用的瀏覽器中。

## 更新紀錄

### 2026.08.05（v1.7.0）

- **中文解釋可直接修正**：閱讀頁的每段中文解釋新增編輯按鈕，可在原位置修改並儲存到目前瀏覽器的教材資料；英文內容、單字進度與閱讀標記不受影響。
- **英文段落可一鍵複製**：每段英文正文尾端新增複製按鈕，可直接複製完整英文段落，不會夾帶中文解釋；成功或剪貼簿權限失敗時都會在原段落顯示狀態。
- **教材生成提示詞可自訂**：教材製作指南中的純文字與圖文提示詞都能分別編輯，修改後會自動保存在目前瀏覽器，並隨完整備份匯出與還原；尚未自訂時仍使用原本的提示內容。
- **單字筆記依教材位置獨立**：相同單字出現在不同教材或同一教材的不同位置時，可以分別保存筆記，不再互相覆蓋；刪除教材時也會一併清除該教材的筆記。
- **可核對本地與線上版本**：教材製作指南底部會顯示目前產品版本 `v1.7.0`；版本遵循 Semantic Versioning，功能增加升 minor，單純修正升 patch，破壞性變更才升 major。
- **首次回到閱讀位置更穩定**：從首頁重新進入長篇教材後，第一次按下「回到閱讀位置」也會正確停在已標記段落並顯示作用中按鈕，不會因延遲排版而落到其他段落。
- **長篇閱讀操作更順手**：「閱讀內容／教材詞彙」切換列不再懸浮占用畫面；有閱讀標記時，「回到閱讀位置」會在捲離標題後懸浮於頁首下方。桌面單字卡維持首次 hover 0.6 秒的防誤觸等待，但開卡時不再凍結整頁捲動；觸控裝置仍會鎖住卡片後方頁面，避免誤捲。
- **輸入單字筆記不再意外收合**：點入筆記編輯區會自動釘選單字卡；中文等 IME 候選視窗短暫移走焦點時，不會關閉卡片或讓背景頁面突然位移，完成組字後才更新並儲存筆記。

## 線上 Demo

[立即開啟英文學習庫](https://kookllcat3.github.io/english-learning/)

Demo 的資料只會保存在目前的瀏覽器中，不同裝置不會自動同步。請使用頁首的「資料管理」匯出 `.elpkg` 備份；舊版 JSON 備份仍可直接匯入。

## 主要功能

- 匯入 UTF-8 TXT、文字型 PDF、含圖文 DOCX，或直接貼上文字建立教材。
- DOCX 圖片會在瀏覽器內轉成 WebP，依原文件順序及目前螢幕寬度顯示。
- 自動整理教材英文正文中的詞彙，排除標題、翻譯與雙語補充，再分別記錄每份教材的認識狀態、完成度與全域熟悉度。
- 教材庫支援每頁 12 份、關鍵字搜尋、搜尋歷史，以及加入時間、名稱和完成度排序。
- 桌面停留單字 0.6 秒後開啟單字卡；觸控、雙擊或框選文字也能直接開啟。卡片提供發音、認識狀態、釘選及 Markdown 筆記；筆記編輯器取得焦點時會自動釘選，IME 組字期間不會被短暫失焦中斷。桌面開卡時保留頁面自然捲動，觸控裝置則鎖住後方頁面，卡片內筆記區仍可獨立捲動；釘選後點擊或觸碰面板外空白處會先取消釘選，再依非釘選規則收合，點擊另一個單字則立即換卡。
- 每段英文正文尾端可複製完整英文段落、一次將該段單字標記為認識，或設定目前閱讀位置；複製內容不包含中文解釋，並會就地顯示成功或失敗狀態。全篇最多標記一段，也可清除全部標記。已標記範圍會以高對比書籤與段落標線涵蓋英文正文，不包含中文解釋；設定閱讀位置後，可從「教材內容」標題旁快速回到該段，向下捲過標題後按鈕會懸浮在頁首下方，清除標記後才會隱藏。
- 直接對應英文正文的中文解釋可逐段編輯與模糊，編輯時可用「儲存／取消」或 Ctrl/Cmd+Enter 儲存、Escape 取消；修改只更新該段 translation 行，不會把中文算入英文單字。桌面停留 0.6 秒或手機觸碰後可切換顯示狀態；標題、雙語索引及 `WORD POWER` 等補充內容保持一般可選取文字。
- 教材製作指南提供純文字與圖文 DOCX 兩種可編輯的 AI 教材提示詞；兩者分別自動儲存在 IndexedDB 並包含於完整備份。閱讀頁也能產生包含教材全文的學習提示詞。
- `.elpkg` 完整備份包含教材、圖片、學習進度、閱讀位置、位置型單字筆記及設定；匯入會先驗證、預覽並合併資料，不會直接清空現有內容。單份教材的圖片、欄位、閱讀位置或筆記關聯錯誤會在確認前列為略過，不影響其他教材匯入；封裝結構、共用詞彙／設定資料或 IndexedDB 寫入失敗，才會拒絕整份備份。舊版全域單字筆記不會套用到任意教材位置，匯入時會顯示略過筆數。
- 響應式支援桌面、平板與手機版面，並保留鍵盤操作及減少動態效果偏好。

## 快速開始

### Windows

下載或 clone 專案後，直接雙擊 `start.cmd`。啟動器會優先使用電腦上的 Node.js 24 或更新版本；如果沒有相容版本，會下載並驗證官方可攜版。第一次啟動或 `package-lock.json` 更新後，也會自動安裝鎖定的套件版本，因此首次執行需要網路。

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

- `#/`：教材庫首頁
- `#/materials/:id`：閱讀教材

舊的 `material.html?id=...` 網址會自動轉到對應的 Hash route。

跨元件的畫面／工作階段狀態由 Pinia 管理；教材、圖片與學習進度不會
複製進 store，仍透過 Repository 寫入 IndexedDB。

所有使用者介面均由 Vue 元件管理；框架無關模組只負責 IndexedDB、
匯入解析、備份合併、單字筆記及文字規則，不直接建立或更新頁面 DOM。

## 資料與隱私

- 教材、詞彙與學習紀錄儲存在瀏覽器 IndexedDB。
- PDF 文字在瀏覽器內由 PDF.js 擷取，不會上傳到本專案的伺服器。
- DOCX 文字與圖片在瀏覽器內解析；圖片轉成 WebP 後才寫入 IndexedDB。
- 備份封裝將 WebP 圖片以獨立資產檔保存，並透過 manifest 與 SHA-256 checksum 驗證完整性；不需要保留原始 DOCX 也能還原圖文內容。
- 單字發音使用瀏覽器 `SpeechSynthesis`，不會將單字送到外部字典服務。
- Markdown 單字筆記依教材與出現位置儲存在本機 IndexedDB，並包含在完整 `.elpkg` 備份封裝中；舊版跨教材共用的全域筆記不會自動轉換。
- 匯入備份時會先顯示新增與更新摘要；同一筆資料保留較新的版本，時間相同時採用這次匯入的內容。
- 瀏覽器資料依網站來源隔離。協定、網域或 port 改變時，會形成另一份資料空間。

請定期使用頁首的資料管理功能匯出備份。清除瀏覽器網站資料可能會移除所有學習紀錄。

## 教材限制

- TXT：UTF-8 純文字，擷取後內容上限 2 MB
- PDF：檔案上限 20 MB，擷取後文字上限 2 MB
- DOCX：檔案上限 30 MB、最多 50 張圖片；單張 WebP 上限 2 MB。圖片會逐張轉檔，數量上限用來控制瀏覽器記憶體、IndexedDB 儲存與備份容量
- PDF 僅支援具有文字層的文件；掃描圖片需要先以其他工具進行 OCR
- 備份：介面接受 100 MB 以內的 `.elpkg` 或舊版 JSON；封裝內容還會檢查項目數、單檔及累積解壓容量，超限、驗證或 IndexedDB 寫入失敗時會顯示錯誤，無法支援的個別教材則自動略過並顯示數量

## 部署

公開倉庫使用 GitHub Actions 自動部署到 GitHub Pages：

- pull request 合併前會執行型別檢查、單元測試、桌面／窄版／觸控 E2E、production E2E、效能與 axe 無障礙檢查，但不會部署。
- `main` 更新或從 Actions 手動執行 workflow 時，會執行 `npm run check:full`；同時必須通過 high 以上 npm audit 與 CodeQL 分析 job 才會發布 `dist/`。
- CI 與本機啟動器以 Node.js 24 為最低支援版本；Pages、artifact、部署及 Node 設定皆使用支援 Node.js 24 runtime 的 GitHub 官方 Action 版本。
- Playwright 失敗時才會從 `.artifacts/playwright/` 保存 HTML report、trace、截圖與 `test-results` Artifact，方便從 Actions 下載定位問題。
- Dependabot 會追蹤 npm 與 GitHub Actions 依賴更新；PR／main 品質 workflow 會執行 CodeQL，另有每週排程掃描。
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
│  │  ├─ materials/
│  │  ├─ models/
│  │  ├─ queries/
│  │  ├─ settings/
│  │  ├─ services/
│  │  └─ text/
│  ├─ features/
│  │  ├─ data-management/components/
│  │  ├─ home/components/
│  │  └─ material/{components,composables,config}/
│  ├─ shared/components/
│  ├─ styles/{base,home,dialogs,material}.css
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

`src/core` 不依賴 Vue，並將 IndexedDB migration、教材存取、dashboard query、
備份、匯入、模型與學習規則分責；`learning-repository.ts` 只保留既有 import 的
相容入口。`features` 擁有各產品功能的元件、composable 與編譯期設定；`shared`
只放跨功能共用能力。第三方離線程式庫集中在 `src/vendor` 由 Vite 打包。

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

CI runner 會使用 `npx playwright install --with-deps chromium` 安裝瀏覽器與必要系統套件；本機若要模擬部署前完整檢查，可執行：

```bash
npm run check:full
npm audit --audit-level=high
```

Playwright 會以桌面 Chromium 與 390 px 窄螢幕執行同一套核心流程，
驗證單一 Vue App、Vue Router、IndexedDB 學習進度持久化、跨分頁同步、
離線資料寫入、舊版資料庫升級、備份往返、axe WCAG 2.0/2.1 A 與 AA
自動檢查基線，以及舊網址轉址。自動檢查不能取代完整的人工無障礙測試。
application E2E 依核心流程、單字卡、彈窗、閱讀進度、AI 助手、備份、教材庫與
韌性測試拆檔；runner 最多使用 4 個 workers，避免多個瀏覽器互搶本機資源。
本機 Playwright 報告與測試結果統一寫入被 Git 忽略的 `.artifacts/playwright/`。
需要一次執行全部自動檢查時使用：

```bash
npm run check:full
```

`check:full` 也會啟動正式 `dist` 預覽，驗證 Hash route、舊網址入口與正式
bundle。效能門檻為首次內容繪製低於 2 秒、大型教材進入詞彙列表低於
2 秒、彈窗開啟回應低於 120 ms、長提示詞分頁切換低於 150 ms；大型詞彙
列表初始最多渲染 300 筆，使用者可再分批顯示。彈窗使用合成層友善的
短過場，教材窄版面板隔離版面計算；圖文教材只為接近可視區域的圖片建立
Blob URL，離開頁面時會立即釋放。

網站資料操作是 local-first：頁面與必要程式已載入後，即使暫時離線仍可
勾選並保存學習進度；重新載入網站本身仍需要靜態主機或瀏覽器快取可用。

修改功能後，至少應在瀏覽器驗證 TXT、PDF、DOCX 教材新增、圖文閱讀、重新命名、刪除、詞彙勾選、單字卡、分頁搜尋及備份還原。

歡迎提交 issue 或 pull request。新增與修改的前端程式必須使用嚴格
TypeScript；持久資料仍維持 local-first，不加入未經產品需求確認的後端資料服務。

## 授權與第三方元件

本專案以 [MIT License](LICENSE) 開源。

PDF 匯入使用 Mozilla PDF.js，DOCX 解析使用 JSZip。完整來源、授權與使用方式請見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
