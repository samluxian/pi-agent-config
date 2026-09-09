# Context Window Retrospective

這個 skill 用有限的 session metrics 與目前可見對話回顧 Pi context window，找出重複讀取、
無效重試、過量驗證、錯誤決策，以及需要使用者提醒才繼續的 initiative gap，再整理成可執行
的改善計畫。Agent 執行規則以
[`SKILL.md`](SKILL.md) 為準。

## 何時使用

- 一段長工作完成後，想知道 context 花在哪裡。
- Reviewer、重試或 compaction 次數偏高，需要分辨必要成本與浪費。
- 想改善 skill、extension 或 parent planning，但暫時不修改它們。

這是 manual skill。請明確執行：

```text
/skill:context-window-retrospective
```

## 不適用

- 直接實作改善方案。
- 分析 abandoned session branches。
- 讀取完整 prompt、conversation、command output、diff 或 logs。
- 評估使用者或開發者的工作表現。

## 怎麼運作

1. 以 active branch 最近一次 compaction 作為 checkpoint。
2. 只統計 checkpoint 之後的 session entries。
3. 從 session file 取得 tool、subagent、reviewer、retry 與 token 等 bounded metrics。
4. 對照可見對話、最後 repository 狀態與 reviewer conclusions。
5. 檢查 Agent 是否反問可安全查得的 identifier、提早停止，或等使用者提醒才讀取 live、pipeline、state 或 validation evidence。
6. 排除必要 approval、mutation handoff、缺少 authentication、secret boundary 與真實 scope ambiguity，避免把安全停點誤判成被動。
7. 把問題分類為 task outcome、parent planning、reviewer、skill 或 extension。
8. 依 correctness/safety、context/latency、便利性排序改善項目。

## 資料邊界

Metrics script 只輸出 counts、有限的 reviewer metadata，以及不含內容的 follow-up signals；
不輸出 message text、prompts、commands、diffs、logs 或 secret values。Follow-up signal 只用來
定位需要語意 review 的回合，不能單獨證明 Agent 被動。缺少 session file 或無法證明因果時，
結果必須標示為 gap，而不是猜測。

## 工具入口

- [`scripts/summarize_session_metrics.py`](scripts/summarize_session_metrics.py)：整理目前 active
  context window 的 bounded metrics。

先查看參數：

```bash
python3 scripts/summarize_session_metrics.py --help
```

## 輸出

結果包含目前成果、流程成本、必要與重複工作的區分、改善優先順序，以及一個最小的下一步。
它不會自動修改 skill 或 extension。
