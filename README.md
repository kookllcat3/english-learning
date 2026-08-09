# 英文學習庫

英文學習庫是一個 local-first 的英文閱讀與詞彙學習網站。你可以匯入自己的教材、閱讀查字、撰寫單字筆記，並從首頁查看累積成果。

網站不需要帳號或後端資料庫；教材與學習紀錄預設只保存在目前使用的瀏覽器中。

## 更新紀錄

### 2026.08.09（v2.0.0）

- **英文正文螢光標記**：每個英文來源段落的工具列最末端提供單一半透明淡黃色螢光筆。啟用後，從未標記單字落筆會上色，從已標記單字落筆會擦除；PC 可點擊或按住滑鼠拖曳，手機以 touch 點字，鍵盤則支援 Enter。可跳過不相鄰單字建立同一群組；點工具按鈕外空白、中文翻譯、其他段落或按 Esc 可退出，重新整理後仍會保留標記。
- **熟悉度視覺整合**：半透明螢光標記會保留熟悉度描邊的辨識度；開啟已熟悉單字的字卡時，標題也會使用與正文相同的深靛藍描邊與淡金逐字流光，不額外顯示等級或進度。
- **頁底單字卡定位穩定**：單字卡開啟時會依可容納的最大高度一次決定顯示在單字上方或下方；筆記載入或內容高度改變後不會跨側重新定位，避免頁底 hover 閃爍。
- **標記資料與備份升級**：IndexedDB 升級為 v9，以可擴充的 `materialAnnotations` 保存螢光標記並遷移既有位置型筆記；`.elpkg` schema v6 會匯出、驗證與合併教材標記，仍可匯入 schema v1～v5。錯誤資料或升級失敗不會留下部分寫入。
- **備份螢光筆可準確還原**：匯入 schema v6 備份時，備份內每篇教材的螢光筆集合會完整取代該教材的本機集合，即使標記 UUID 或時間不同也以備份為準；備份未包含的教材與舊版備份既有標記不受影響。
- **既有教材可匯出後更新**：教材卡提供「開始閱讀／匯出／更新／移除」四個固定操作；純文字教材匯出為 UTF-8 TXT，圖文教材匯出為可再次匯入的 DOCX。重新匯入 TXT、文字型 PDF 或 DOCX 時會更新同一份教材，保留仍存在於新正文的已認識單字與共用筆記，並清除不再適用的閱讀位置。
- **閱讀位置同步累積單字進度**：標記或往後移動閱讀位置時，會把文章開頭至該段為止的英文正文單字加入這份教材的已認識進度；往前移動或取消位置不會移除既有進度。頁底「完成本次學習」只補上剩餘單字並保留閱讀位置；任何寫入失敗都不會留下只更新位置或只更新單字的半成品。

### 2026.08.08

- **教材頁專注於閱讀內容**：移除「閱讀內容／教材詞彙」切換器、教材詞彙列表、搜尋及批次勾選介面；標題與正文改為同一條扁平閱讀主欄，標題固定單行並在截斷時以 hover 顯示完整內容，不再嵌入第二層白色卡片。既有詞彙學習紀錄、首頁統計、備份資料與正文熟悉度效果仍會保留。
- **完成本次學習**：教材頁底提供單一完成按鈕，可將該篇教材的全部英文單字標記為認識並更新既有學習進度；全部標記完成後按鈕會停用，重新進入教材仍維持完成狀態。

### 2026.08.06（v1.8.1）

- **單字筆記改為同單字共用**：同一個英文單字無論出現在不同教材、重複段落、教材詞彙或框選查詢，都會顯示同一份筆記；空白筆記區會清楚提示內容將在所有教材顯示。
- **完整備份同步共用筆記**：新版 `.elpkg` 會保存共用單字筆記，舊版全域筆記也會還原；既有位置型筆記資料不會被自動轉換或覆寫。
- **框選單字卡標題不會意外收合**：在單字卡標題開始拖曳框選時，卡片會立刻自動釘選，讓原生文字選取可穩定完成。
- **單字卡操作更精簡**：移除卡片內的認識狀態切換；發音與釘選按鈕並列，認識進度改由閱讀位置與頁底「完成本次學習」累積。
- **快速查字不再閃爍**：單字卡會先定位並顯示，再載入共用筆記內容；快速移到不同單字時不必等待每次讀取完成。
- **AI 學習面板更緊湊**：完整提示詞改在編輯區旁直接複製，成功訊息就地顯示；展開重新提醒時，面板維持固定的上下安全留白並在內部捲動。
- **手機備份選擇更精準**：選擇器僅用 `.elpkg` 與 `.json` 副檔名過濾，避免混入相機、相片及影片來源。
- **首頁統計名稱更清楚**：跨教材去重的單字數標示為「已認識單字」，直接對應實際計數內容。

## 線上 Demo

[立即開啟英文學習庫](https://kookllcat3.github.io/english-learning/)

Demo 的資料只會保存在目前的瀏覽器中，不同裝置不會自動同步。請使用頁首的「資料管理」匯出 `.elpkg` 備份；舊版 JSON 備份仍可直接匯入。

## 主要功能

- 匯入 UTF-8 TXT、文字型 PDF、圖文 DOCX，或直接貼上文字建立教材。
- 教材庫提供搜尋、分段式排序與學習進度摘要；每份教材可直接匯出，並用 TXT、文字型 PDF 或 DOCX 更新同一份教材，不會建立重複項目。排序選取只改變選項內部底色，正文與單字卡標題的熟悉度使用固定深靛藍描邊與淡金流光，並與半透明閱讀標記背景清楚分層。
- 閱讀頁會辨識英文正文與相鄰中文翻譯；每段左上方依序提供閱讀位置、翻譯顯示／隱藏及英文複製工具。標記閱讀位置會同步累積讀到該段的英文正文單字，頁底也可一次補完剩餘進度。
- 單字可透過 hover、觸碰、雙擊或框選開啟單字卡，提供發音、釘選與所有教材共用的 Markdown 筆記。
- AI 工具可編輯教材製作提示詞，並依目前教材產生完整學習提示詞。
- `.elpkg` 備份包含教材、進度、筆記、設定與圖片；匯入前會驗證、預覽並合併，舊版 JSON 仍可使用。
- 支援桌面、平板與手機，並保留鍵盤操作與減少動態效果偏好。

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
- 教材匯出與重新匯入都在瀏覽器內完成；更新採單一 IndexedDB 交易，解析或寫入失敗時會保留原教材。
- 閱讀位置與已認識單字會在同一個 IndexedDB 交易中更新；寫入失敗或另一分頁已先更新時，兩者都維持操作前狀態。
- 備份封裝將 WebP 圖片以獨立資產檔保存，並透過 manifest 與 SHA-256 checksum 驗證完整性；不需要保留原始 DOCX 也能還原圖文內容。
- 單字發音使用瀏覽器 `SpeechSynthesis`，不會將單字送到外部字典服務。
- Markdown 單字筆記以正規化後的單字作為 key 儲存在本機 IndexedDB，所有教材共用，並包含在完整 `.elpkg` 備份封裝中；既有位置型筆記不會自動轉換或覆寫。
- 匯入備份時會先顯示新增與更新摘要；同一筆資料保留較新的版本，時間相同時採用這次匯入的內容。
- 瀏覽器資料依網站來源隔離。協定、網域或 port 改變時，會形成另一份資料空間。

請定期使用頁首的資料管理功能匯出備份。清除瀏覽器網站資料可能會移除所有學習紀錄。

## 教材限制

- TXT：UTF-8 純文字，擷取後內容上限 2 MB
- PDF：檔案上限 20 MB，擷取後文字上限 2 MB
- DOCX：檔案上限 30 MB、最多 50 張圖片；單張 WebP 上限 2 MB。圖片會逐張轉檔，數量上限用來控制瀏覽器記憶體、IndexedDB 儲存與備份容量
- 教材匯出：不含圖片時為 UTF-8 TXT；含圖片時為 DOCX，保留文字、圖片、替代文字、說明與內容順序，但不還原原始文件排版
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
├─ scripts/
│  ├─ playwright-runner.mjs
│  ├─ run-e2e-tests.mjs
│  ├─ run-production-tests.mjs
│  └─ start.ps1
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

Playwright 會以桌面 Chromium、390 px 窄螢幕與觸控裝置執行核心流程，
驗證單一 Vue App、Vue Router、IndexedDB 學習進度持久化、跨分頁同步、
離線資料寫入、舊版資料庫升級、螢光標記、備份往返、axe WCAG 2.0/2.1 A 與 AA
自動檢查基線，以及舊網址轉址。自動檢查不能取代完整的人工無障礙測試。
application E2E 依核心流程、單字卡、彈窗、閱讀進度、AI 助手、備份、教材庫與
韌性測試拆檔；runner 最多使用 4 個 workers，避免多個瀏覽器互搶本機資源。
一般與 production E2E runner 會直接管理各自的 Vite server，並在測試結束時關閉，
避免 Windows 留下未結束的 npm 子程序。
本機 Playwright 報告與測試結果統一寫入被 Git 忽略的 `.artifacts/playwright/`。
需要一次執行全部自動檢查時使用：

```bash
npm run check:full
```

`check:full` 也會啟動正式 `dist` 預覽，驗證 Hash route、舊網址入口與正式
bundle。效能門檻為首次內容繪製低於 2 秒、大型教材閱讀頁低於 2 秒、
350 個唯一單字的末段首次標記低於 500 ms、
彈窗開啟回應低於 120 ms、長提示詞分頁切換低於 150 ms。彈窗使用合成層
友善的短過場，教材窄版面板隔離版面計算；圖文教材只為接近可視區域的圖片建立
Blob URL，離開頁面時會立即釋放。

網站資料操作是 local-first：頁面與必要程式已載入後，即使暫時離線仍可
編輯單字筆記與標記閱讀位置；重新載入網站本身仍需要靜態主機或瀏覽器快取可用。

修改功能後，至少應在瀏覽器驗證 TXT、PDF、DOCX 教材新增、圖文閱讀、重新命名、刪除、正文熟悉度、單字卡、教材庫搜尋與分頁及備份還原。

歡迎提交 issue 或 pull request。新增與修改的前端程式必須使用嚴格
TypeScript；持久資料仍維持 local-first，不加入未經產品需求確認的後端資料服務。

## 授權與第三方元件

本專案以 [MIT License](LICENSE) 開源。

PDF 匯入使用 Mozilla PDF.js，DOCX 解析使用 JSZip。完整來源、授權與使用方式請見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
