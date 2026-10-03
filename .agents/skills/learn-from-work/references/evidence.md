# 證據與教材規則

## 教材優先順序

1. 使用者本次明確指定的工作、概念或複習卡。
2. 目前可見對話中最近一個已完成的 AI 工作單元，以及當時可見的驗證結果。
3. 已確認 target 的具名 source、diff、caller、default、test 或 defining contract。
4. 與概念直接相關的官方文件；需要外部查證時依 workspace 規則交給 researcher。

外部文件是補充機制，不是替代專案教材。不要為了講課重新調查所有 siblings、
整批讀取 wiki、列舉歷史 sessions，或對使用者貼來的 script 直接執行。

## 最小教材包

建立以下內部索引，不必把它變成冗長回覆：

| 項目 | 要確認的事 |
| --- | --- |
| 任務 | 使用者要什麼？完成摘要是否可見？ |
| 所有者 | 工作屬於哪個 repository 或具名文件？是否有多個 target？ |
| 時點 | 這是當時的修改，還是目前 working tree？ |
| 範圍 | 哪些檔案/片段屬於這次工作？哪些是既有或他人的變更？ |
| 行為 | 核心入口、資料/控制流、輸出或設定效果。 |
| 關聯契約 | 最近的 caller、default、test 或 policy，選能解釋機制的最少集合。 |
| 驗證 | 誰執行了什麼、對哪個狀態、看見什麼結果？ |
| 缺口 | 哪些問題在現有 evidence 下無法回答？ |

先使用對話中已足夠的證據。需要本機補讀時，限定到具名 target；可安全讀取 Git
branch/status 和相關 diff，但不 fetch、切 branch 或修改 Git。
若不是 Git repository，改用具名文件及使用者提供的背景，不阻止純概念教學。

如果 staged 與 unstaged changes 同時存在，分開看；Git diff 不會自動包含 untracked
files。不因檔案沒出現在 diff 中就聲稱它不存在，也不把整個工作樹當成一次修改。
對大型 diff 先看 changed-file summary，再挑選會影響核心行為的 hunks。
只在新檔確定屬於此次工作且非 ignored/generated/secret 時讀取。

## 四類敘述

- **可觀察事實：** source 或可見結果直接支持，例如某個條件分支會回傳錯誤。
- **有依據的解讀：** 根據需求與 source 解釋此設計的作用；用「這樣做有助於……」。
- **教學假設：** 為練習刻意改變條件；明確使用「假設」，不要當成實際需求。
- **未證實：** 缺少 caller、runtime、測試結果或原始背景；明確標示。

不要聲稱能重現 AI 的隱藏推理。把決策解釋成「依目前需求，可以用以下理由評估」，
不是「AI 當時一定是這樣想」。同樣不替使用者捏造原始動機。

## Before / After 與時效

- 只有可見 diff、具名歷史 artifact 或使用者提供的片段才能支持 before/after。
- 沒有 baseline 時，用「目前版本做什麼」，不能編造舊版的 bug 或效能。
- 原工作之後又有修改，分開教「當時的結果」與「目前的實作」。
- 遠端、版本、API 或 deployed state 可能過期時，標示時效限制，不主動擴大查詢。
- 使用者想重學已 compact 掉的工作，請其指出目標或提供非機密摘要。
- 新 session 的模型不會因 Skill 存在就自動記得前次學習；需要可見教材或複習卡。

## 驗證的證據邊界

| 已知資料 | 能支持什麼 | 不能直接支持什麼 |
| --- | --- | --- |
| Source / config | 程式意圖、靜態流程、desired state | 真實輸入下成功、已部署、權限就緒 |
| Test source | 預期檢查與 covered cases | 測試已執行或通過 |
| 可見執行結果 | 該次執行在其範圍內的結果 | 後續狀態、所有 edge cases、未跑的環境 |
| Render / local plan | 渲染或規劃出的內容 | 實際資源、cloud 權限、runtime 行為 |
| CI 結果 | 該 pipeline/job 的觀察 | 另一個 commit、所有部署與使用者體驗 |
| 使用者說明 | 使用者回報的觀察 | Agent 已獨立核實 |
| 聊天內的解答 | 在此假設下的推理或草稿 | 已編譯、測試、apply 或 deploy |

基礎設施維持分層：application/CI → desired state → chart render → Argo CD →
live Kubernetes → runtime/GCP。複習只說明已有層次，不為了補齊表格查詢所有層。
時間紀錄保留來源時區；不要把 UTC 與本地時間混用。

## 不同教材怎麼教

| 教材 | 主要地圖 | 理解檢查例型 |
| --- | --- | --- |
| 應用程式 | 入口 → 驗證 → 處理 → 狀態/副作用 → 回傳 | 無效輸入會在哪裡被攔截？ |
| 設定 / CI | 設定 → 使用者/consumer → 執行條件 → 產物 | 哪個預設或優先序會改變結果？ |
| Helm / GitOps | values → template/render → desired state → reconciliation | render 成功還不能證明什麼？ |
| Terraform / IAM | root/module → provider → resource intent → plan → 權限邊界 | 為什麼 plan 不是已部署的證明？ |
| 文件 / 規則 | 適用情境 → 行為契約 → 例外 → 判定方式 | 這個情境是否在規則範圍內？ |
| 診斷 | 症狀 → 假設 → probe → evidence → 結論/缺口 | 哪個最小檢查能區分兩種原因？ |

不適用的概念直接略過，例如純文件沒有函式呼叫流，不能虛構它有 runtime。
不從只改命名或格式的工作硬湊出架構課程。

## 證據不足或發現問題

- **目標不明：** 問一個定位問題，暫停具體 source 說明。
- **背景缺少：** 說明現有機制，原始「為什麼」標示未提供。
- **結果不可見：** 教會應如何驗證，但不宣稱通過，不擅自執行。
- **疑似 bug：** 指出具名片段、可能影響、仍需的檢查；不靜默修復。
- **安全問題：** 停止會揭露或操作機密的步驟，用合成例子教機制。
- **需大量讀取：** 依上層規則用 bounded read-only subagent，只回傳片段索引、機制與缺口。

## 保存界線

複習卡預設只在聊天中。使用者要求保存時，確認 destination、是否為私人教材、
是否已有內容以及 owning repository 的權限/branch/ignore 規則。
未指定路徑的學習報告依 workspace 文件政策處理；不能假定任何目錄都可寫。
不得因模板存在就自動保存，不自動更新 wiki，也不把私人教材複製回公開 Skill。
