# Context Window Retrospective

這個 skill 用有限的 session metrics 回顧目前 Pi context window，找出重複讀取、無效重試、
過量驗證或錯誤決策，再整理成可執行的改善計畫。Agent 執行規則以
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
5. 把問題分類為 task outcome、parent planning、reviewer、skill 或 extension。
6. 依 correctness/safety、context/latency、便利性排序改善項目。

## 資料邊界

Metrics script 只輸出 counts 與有限的 reviewer metadata，不輸出 message text、prompts、
commands、diffs、logs 或 secret values。缺少 session file 或無法證明因果時，結果必須標示
為 gap，而不是猜測。

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
