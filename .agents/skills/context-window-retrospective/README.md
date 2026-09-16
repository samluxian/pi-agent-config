# Context Window Retrospective

這個 skill 用有限的 session metrics 與目前可見對話回顧 Pi context window，找出重複讀取、
無效重試、過量驗證、錯誤決策，以及需要使用者提醒才繼續的 initiative gap，再整理成只針對
Pi agent harness 的可執行改善計畫。Agent 執行規則以
[`SKILL.md`](SKILL.md) 為準。

## 何時使用

- 一段長工作完成後，想知道 context 花在哪裡。
- Reviewer、重試或 compaction 次數偏高，需要分辨必要成本與浪費。
- 想改善 `AGENTS.md`、skill、extension、settings、validation、orchestration 或 parent planning，但暫時不修改它們。

這是 manual skill。請明確執行：

```text
/skill:context-window-retrospective
```

## 不適用

- 直接實作改善方案。
- 規劃或修改 product、service、GitOps、infrastructure、cloud 或 runtime；這些只能作為 task outcome 或 remaining gap。
- 分析 abandoned session branches。
- 讀取完整 prompt、conversation、command output、diff 或 logs。
- 評估使用者或開發者的工作表現。

## 怎麼運作

1. 以 active branch 最近一次 compaction 作為 checkpoint。
2. 只統計 checkpoint 之後的 session entries。
3. 從 session file 取得 tool、subagent、reviewer 與 usage 等 bounded metrics。
4. 將 parent usage 依 model／thinking 分組，並分開 uncached input、cache read、output 與其中的 reasoning；subagent 另列，避免重複加總。
5. 統計各 tool result 的 UTF-8 文字 bytes，作為 context volume 指標，不把 bytes 當 tokens 或費用。
6. 對照可見對話、最後 repository 狀態與 reviewer conclusions。
7. 檢查 Agent 是否反問可安全查得的 identifier、提早停止，或等使用者提醒才讀取 live、pipeline、state 或 validation evidence。
8. 排除必要 approval、mutation handoff、缺少 authentication、secret boundary 與真實 scope ambiguity，避免把安全停點誤判成被動。
9. 把問題分類為 task outcome、parent planning、reviewer、skill 或 extension。
10. 先找出能減少未來 discovery、research、context 或使用者提醒的可重用知識，依通用規則、domain workflow、公開技術知識、deterministic check 或 runtime enforcement 選擇 `AGENTS.md`、skill、LLM Wiki、script 或 extension 作為單一 owner。
11. 除非 P0 correctness/safety 需要強制防護，優先內化知識與工作流程，再考慮增加檢查；沒有可支持的 harness 改善時明確回報無項目。

## 資料邊界

Metrics script 只輸出 counts、model/thinking usage 分組、cache／output／reasoning 欄位、
subagent usage與completed／parent-or-user-aborted／timeout／process-failure／unknown分類、tool-result文字bytes、有限的reviewer metadata，以及不含內容的follow-up signals；不輸出message text、prompts、commands、diffs、logs或secret values。

`reasoning` 是 `output` 的子集，不能重複加總；tool bytes 不是 tokenizer 結果；provider usage
不是經核對的帳單。Follow-up signal 只用來定位需要語意 review 的回合，不能單獨證明 Agent
被動。缺少 session file、usage 欄位或可比較基準時，結果必須標示為 gap，而不是猜測。

## 工具入口

- [`scripts/summarize_session_metrics.py`](scripts/summarize_session_metrics.py)：整理目前 active
  context window 的 bounded workflow、usage、cache 與 tool-volume metrics。

先查看參數：

```bash
python3 scripts/summarize_session_metrics.py --help
```

## 輸出

結果包含目前成果、流程成本、必要與重複工作的區分、可內化知識與owner surface、Pi agent harness改善優先順序，以及一個最小的harness下一步。產品與平台問題只列為task outcome或remaining gap，不會成為optimization action。它不會自動修改agent設定、skill、wiki或extension。
