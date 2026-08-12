# 英文學習庫

英文學習庫是一個 local-first 的英文閱讀與詞彙學習網站。你可以匯入自己的教材、閱讀查字、撰寫單字筆記，並從首頁查看累積成果。

網站不需要帳號或後端資料庫；教材與學習紀錄預設只保存在目前使用的瀏覽器中。

## 更新紀錄

### 2026.08.12（v2.0.4）

- **資料影響提示**：更新刪除前說明影響。
- **段落辨識修正**：支援換行、英中與歌詞分段。

## 線上 Demo

[立即開啟英文學習庫](https://kookllcat3.github.io/english-learning/)

Demo 的資料只會保存在目前的瀏覽器中，不同裝置不會自動同步。請使用頁首的「資料管理」匯出 `.elpkg` 備份；舊版 JSON 備份仍可直接匯入。

## 主要功能

- **建立教材**：匯入 TXT 或貼上文字。
- **教材管理**：搜尋、排序、更新與匯出。
- **閱讀分段**：辨識正文、英中翻譯與歌詞。
- **閱讀工具**：翻譯、複製、標記與書籤。
- **學習進度**：依書籤累積已讀單字。
- **單字卡**：查字、發音、釘選與筆記。
- **AI 工具**：產生教材與學習提示詞。
- **資料備份**：驗證、預覽並合併備份。
- **相容裝置**：支援桌面、平板與手機。
- **無障礙**：支援鍵盤與減少動態效果。

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
- 教材匯出與重新匯入都在瀏覽器內完成；更新前會說明內容、圖片、閱讀位置及無法重新定位的標記會如何處理。更新採單一 IndexedDB 交易，解析或寫入失敗時會保留原教材。
- 移除教材前會明確區分將刪除的教材內容、閱讀位置與位置型紀錄，以及會保留的共用單字筆記與詞彙紀錄。只在被移除教材標為已認識的單字會改為未認識；移除與詞彙狀態重算採同一個 IndexedDB 交易，任一步驟失敗時都維持操作前內容。
- 閱讀位置與已認識單字會在同一個 IndexedDB 交易中更新；寫入失敗或另一分頁已先更新時，兩者都維持操作前狀態。
- 備份封裝將 WebP 圖片以獨立資產檔保存，並透過 manifest 與 SHA-256 checksum 驗證完整性；不需要保留原始 DOCX 也能還原圖文內容。
- 單字發音使用瀏覽器 `SpeechSynthesis`，不會將單字送到外部字典服務。
- Markdown 單字筆記以正規化後的單字作為 key 儲存在本機 IndexedDB，所有教材共用，並包含在完整 `.elpkg` 備份封裝中；既有位置型筆記不會自動轉換或覆寫。
- 匯入備份時會先顯示新增與更新摘要；同一筆資料保留較新的版本，時間相同時採用這次匯入的內容。
- 瀏覽器資料依網站來源隔離。協定、網域或 port 改變時，會形成另一份資料空間。

請定期使用頁首的資料管理功能匯出備份。清除瀏覽器網站資料可能會移除所有學習紀錄。

## 教材限制

- TXT：UTF-8 純文字，內容上限 2 MB；支援 LF、CRLF 與 CR 換行
- 教材匯出：目前僅提供不含圖片教材的 UTF-8 TXT
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
並以 360×800、768×1024、1024×768、1440×900 與 844×390 橫向視窗覆蓋代表性 RWD 行為，
驗證單一 Vue App、Vue Router、IndexedDB 學習進度持久化、跨分頁同步、
離線資料寫入、舊版資料庫升級、螢光標記、備份往返、axe WCAG 2.0/2.1 A 與 AA
自動檢查基線，以及舊網址轉址。自動檢查不能取代完整的人工無障礙測試。
application E2E 依核心流程、單字卡、彈窗、閱讀進度、AI 助手、備份、教材庫與
韌性測試拆檔；application 與 production runner 在本機最多使用 4 個 workers，CI 固定使用單一 worker，避免效能門檻受到共享 runner 的平行負載干擾。
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
彈窗開啟回應低於 120 ms。彈窗使用合成層
友善的短過場，教材窄版面板隔離版面計算；圖文教材只為接近可視區域的圖片建立
Blob URL，離開頁面時會立即釋放。

網站資料操作是 local-first：頁面與必要程式已載入後，即使暫時離線仍可
編輯單字筆記與標記閱讀位置；重新載入網站本身仍需要靜態主機或瀏覽器快取可用。

修改功能後，至少應在瀏覽器驗證 TXT 教材新增與更新、既有圖文教材閱讀與匯出、重新命名、刪除、正文熟悉度、單字卡、教材庫搜尋與分頁及備份還原。

歡迎提交 issue 或 pull request。新增與修改的前端程式必須使用嚴格
TypeScript；持久資料仍維持 local-first，不加入未經產品需求確認的後端資料服務。

## 授權與第三方元件

本專案以 [MIT License](LICENSE) 開源。

PDF 匯入模組使用 Mozilla PDF.js，DOCX 解析模組使用 JSZip，介面圖示使用 Lucide。完整來源、授權與使用方式請見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
