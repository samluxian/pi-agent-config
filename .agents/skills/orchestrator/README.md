# Orchestrator

這個 skill 是其他 domain skills 的 companion。它把大型、可獨立的 evidence 工作交給
subagents，讓 parent 保留 context、權限判斷與最後決策。Agent 執行規則以
[`SKILL.md`](SKILL.md) 為準。

## 何時使用

- 需要讀取多個大型來源或執行多次搜尋。
- Raw output 可能佔滿 parent context。
- 使用者明確要求 subagent。

簡單的 known-path read、單一 URL fetch 或緊密耦合的推理留在 parent，不為了形式而委派。

## 角色

| Role | 工作 |
| --- | --- |
| `scout` | 唯讀 local repository evidence。 |
| `researcher` | 唯讀 web research 與來源整理。 |
| `environment-scout` | 對明確 Kubernetes/GCP 目標做 structured read-only inspection。 |
| `worker` | 只處理已批准且 file ownership 明確的 isolated edit。 |

## 怎麼運作

1. Parent 先定義 decision、known facts、knowledge gaps、paths、budget 與 stop condition。
2. 每個 child task 使用 `GOAL`、`INPUT`、`DO`、`DO NOT`、`STOP`、`RETURN`。
3. 最多平行執行四個互相獨立的 read-only tasks。
4. Worker 維持 single mode。
5. Parent 對照 primary evidence，處理 conflicts、stale evidence 與 unsupported claims。
6. Repository edit 後由 parent 或 approved worker 執行最小充分 validation。

## Authority 邊界

Subagent 是隔離的執行程序，不會繼承 parent conversation 或 approval。Parent 保留 scope、
批准狀態、mutation authority、evidence reconciliation 與 final judgment。任何 child 都不能
用來繞過 branch、secret、remote 或 deployment 規則。

## 輸出

Orchestrator 回傳 reconciled decision、evidence conflicts、validation gaps、authority/context
風險，以及一個具體下一步。Child summaries 不是自動成立的最終結論。
