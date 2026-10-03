# Learn From Work

手動啟用的「實作後學習與複習」Skill。你照常請 AI 完成工作；想知道剛才到底做了什麼、
為什麼這樣做、自己下次怎麼做時，再啟用它。不是常駐導師，不會在一般開發中自動插入考題。

## 啟用

已有此 repository 的 workspace skills symlink 或 Pi package 設定時，不需要另外安裝
extension、Python 或其他依賴。新增 Skill 後，在目前 Pi session 執行 `/reload`。

```text
/skill:learn-from-work
```

預設以目前對話最近一個可辨識的 AI 工作為教材，進行完整、分輪的學習。
也可以在命令後直接說你想學什麼：

```text
/skill:learn-from-work 完整複習剛才的修改，我希望下次能自己做
/skill:learn-from-work 我不懂剛才的錯誤處理，從基礎開始解釋
/skill:learn-from-work 只解釋剛才改的設定優先序與驗證限制
/skill:learn-from-work 考我剛才的資料流，先不要給答案
/skill:learn-from-work 給我一個相似的小練習，不要修改專案
/skill:learn-from-work 我想隔日複習，以下是上次的複習卡……
```

這些是自然語言要求，不是需要記住的程式參數。你可隨時要求更簡單、更深入、給提示、
直接給答案、跳過問答、只看摘要、暫停或返回開發。

如果使用中的 Pi 不支援 `disable-model-invocation`，不能假定它有手動限定效果；
請先確認該版本的 skills 文件。此 repository 目前使用的 Pi 文件與 loader 支援此欄位。
其他 Agent Skills 宿主的載入與觸發行為需另行核實。

## 完整流程包含什麼？

1. **鎖定教材：** 從可見任務、相關檔案與驗證結果辨識工作，不把所有 dirty changes
   都當成 AI 的改動。
2. **工作地圖：** 理解原始問題、改動責任、作用機制、效果及未涵蓋範圍。
3. **概念解說：** 使用具體片段追蹤流程，補必要先備知識，不只逐行唸程式碼。
4. **設計取捨：** 比較相關替代方案，說明何時該重新評估，不捏造 AI 當時的內心推理。
5. **驗證與除錯：** 將檢查對應到需求，區分已知結果、預期行為與證據缺口。
6. **理解與練習：** 回述、預測、仿作、除錯、遷移；一次一題，按需提供提示。
7. **複習卡：** 在聊天中整理重點、可見能力狀態、無答案回憶題與下一個小練習。

預設完整，但不是一次灌完全部教材。也可選快速回顧、聚焦單一概念、純測驗、
自行練習或延後複習。你決定節奏，不需要通過所有題目才能結束。

## 支援的教材

- 應用程式：輸入驗證、資料/控制流、錯誤處理、狀態、介面與測試。
- 設定、CI、Helm、GitOps、Terraform：consumer、優先序、desired state、驗證與權限邊界。
- 文件與規則：適用範圍、行為契約、例外與可判定性。
- 診斷：症狀、假設、檢查、證據與尚未解決的缺口。

它不是領域規範的替代品，也不聲稱 source 或 local checks 能證明已部署成功。

## 手動限定與唯讀邊界

`SKILL.md` 使用 `disable-model-invocation: true`。Pi loader 會保留 Skill，
但不把它放進自動選用的 skill 清單；你用 `/skill:learn-from-work` 明確載入。
這不是阻擋所有工具行為的 runtime 安全機制。

- 不修改 `AGENTS.md`，不新增自動 routing、hook 或 extension。
- 啟用後預設只做教學與必要的安全、本機唯讀補查。
- 不自動執行程式、測試、建置、安裝、部署或遠端查詢。
- 練習預設在聊天中進行；程式片段、diff、設定草稿不會自動套用，也不宣稱已執行。
- 不讀取 secrets、credentials、`.env` 或 raw kubeconfig，也不要求你貼出它們。
- 不自動保存 profile、進度、wiki 或學習筆記，不建立 reminders。
- 使用者要求修改、執行或保存時，仍遵循 owning repository 的授權與安全限制。

## 複習與記憶

Skill 不會自動記得跨 session 的課程。新 session 或 compact 後，可能需要你指出檔案
或提供非機密的完成摘要/複習卡。你可以自行保留聊天中的卡片，再於下次手動呼叫時提供。

能力回報只依可見回答：獨立完成、需要提示、需要補課、尚未評量。沒有回答不代表答錯，
也不會假裝已學會。這個流程沒有已證實的學習提升百分比，不能保證速度、品質或 token 成本。

私人專案教材不可存入這個公開 skills repository。需要保存時，先指定合適目的地，
確認現有內容、privacy 與 repository 邊界；呼叫 Skill 本身不授權任何檔案寫入。

## 維護與驗證

核心流程在 [SKILL.md](SKILL.md)，細節放在 references，複習卡結構放在 assets。
改動時一起確認：

- Pi 原生 loader 無 diagnostics，名稱與目錄一致，手動限定旗標為 true。
- 自動 skill prompt 排除它，但明確載入所需的 Skill 資料仍存在。
- 所有相對文件連結可解析；教材錨點與安全規則沒有矛盾。
- 用概念範例檢查：目標不明、缺 diff、他人變更、只測驗、要求答案、疑似 bug、
  新 session、保存私人卡片及返回開發時的行為。

Loader 檢查不等於互動指令或教學成效測試；首次使用仍需在 Pi reload 後確認
`/skill:learn-from-work` 可以載入。不要為此重新執行 workspace initializer。

## 文件

- [核心流程](SKILL.md)
- [證據與教材規則](references/evidence.md)
- [教學方法](references/teaching-method.md)
- [練習與評量](references/practice.md)
- [複習卡模板](assets/review-card.md)
