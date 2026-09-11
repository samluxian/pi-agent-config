# LLM Wiki

這個 manual skill 管理 repository 內的純 Markdown 知識庫。它讓人可以循目錄閱讀，也讓 Agent
先查小型 index，再只載入相關筆記，避免把整個 wiki 放進 context window。

## 使用時機

- 查詢過去遇過的技術機制、事故、決策或 runbook。
- 把已驗證的基礎知識、問題、解法與來源整理成可重用筆記。
- 將 private system 經驗重新建立成不可識別的 synthetic case。

明確維護 wiki 時執行：

```text
/skill:llm-wiki
```

一般排錯不必手動載入 skill。Workspace contract 會要求 Agent 在外部研究前先執行 bounded
lookup；查無適用筆記後才走 domain workflow 或外部研究。

## 漸進式檢索

```text
問題關鍵字
→ knowledge/INDEX.md 的 topic metadata
→ 一個 topic INDEX.md
→ 最多三篇候選 note
→ 目前環境的版本與 runtime 驗證
```

工具入口：

```text
scripts/wiki.py find --query <terms> --limit 5
scripts/wiki.py check
```

Lookup 只輸出候選 metadata，不輸出筆記全文。Keyword index 沒有語意推論、拼字修正或自動
freshness 判斷；aliases、狀態與人工 review 用來補足這些限制。

## 文件入口

- [`SKILL.md`](SKILL.md)：Agent retrieval 與維護流程。
- [`references/note-contract.md`](references/note-contract.md)：metadata、內容與來源規格。
- [`references/writing-style.md`](references/writing-style.md)：英文與 pinned No AI Slop 寫作規格。
- [`references/private-to-synthetic.md`](references/private-to-synthetic.md)：private 經驗的重新建構規則。
- [`assets/fundamental-note.md`](assets/fundamental-note.md)：基礎知識模板。
- [`assets/incident-note.md`](assets/incident-note.md)：事故／問題模板。
- [`../../../knowledge/README.md`](../../../knowledge/README.md)：知識庫的人類閱讀入口。

## 邊界

- V1 不包含網站、static site generator、vector database、embedding、RAG service 或外部 SaaS。
- `knowledge/` 與 note templates 的人類可讀內容一律使用英文，並通過 pinned No AI Slop
  editing 與 evaluation；維護說明可保留繁體中文。
- Wiki 是 prior knowledge，不是目前部署狀態、版本或健康度的證據。
- Public repository 不保存 private source link、名稱、原始 log、設定、payload 或可重識別拓撲。
- `verified` incident 必須有根因、resolution 與 behavior-level validation；否則保持 `open`。
