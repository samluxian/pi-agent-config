# MR Summary

這個 skill 根據 repository evidence 撰寫可直接貼到 GitLab 或 GitHub 的台灣繁體中文 MR
標題、描述、branch note 或跨 repository handoff。Agent 執行規則以
[`SKILL.md`](SKILL.md) 為準。

## 何時使用

- 已完成修改，需要整理 MR title 與 description。
- 需要把多個 repositories 的責任與交付順序寫清楚。
- 想把 validation results、風險與後續操作整理成 review-friendly 內容。

## 不適用

- 實作程式或 desired state。
- Repository audit、code review 或 incident diagnosis。
- 在缺少 diff、status 或 validation evidence 時宣稱工作已完成。

## 怎麼運作

1. 確認 target repository、comparison base、branch freshness、讀者與 ticket。
2. 讀取 bounded status、changed-file summary、必要 diff hunks 與 validation evidence。
3. 從 ticket、文件或使用者說明確認背景與目的。
4. 分開寫 observed facts、設計判斷、風險與 validation gaps。
5. 跨 repository 時，逐一標示 owner、相依順序與 handoff。
6. 依固定模板產生 MR 標題與內容。

## 證據與安全邊界

這個 skill 不修改 Git、repository files 或 GitLab/GitHub。Remote refs 可能過期時會直接說明，
不把 local branch 當成最新 remote truth。沒有執行的 test、render、plan 或 review 不會寫成
已通過。

## 文件入口

- [`assets/mr-summary-template.md`](assets/mr-summary-template.md)：MR 內容結構與欄位順序。

## 輸出

預設只回傳可直接使用的台灣繁體中文 MR title 與 description。Commands、paths、resource
names、版本與其他 technical identifiers 保持原文。
