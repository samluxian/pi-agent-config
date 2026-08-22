# Developer Activity Summary

這個 skill 從已驗證身分的 GitLab 或 GitHub 活動，整理指定日期範圍的第一人稱工作更新。
Agent 執行規則以 [`SKILL.md`](SKILL.md) 為準。

## 何時使用

- 撰寫每日工作紀錄或週報素材。
- 需要依台灣或其他明確時區切分日期。
- Primary 平台資料不足時，要依指定 fallback window 補充另一個平台。

## 不適用

- 撰寫 MR 說明。
- Repository audit、實作或 troubleshooting。
- 績效評估或推測沒有 activity evidence 的工作。

## 怎麼運作

1. 確認 absolute dates、timezone、平台、輸出語言與 fallback 規則。
2. 使用 authenticated `glab` 或 `gh` evidence 確認帳號身分。
3. 收集 commits、MRs/PRs、reviews、comments、issues 與 repository events。
4. 依指定 timezone 將活動放回 local calendar date。
5. 只在 primary evidence 不足時使用 fallback，並清楚標示來源。
6. 去除重複事件，產生每日第一人稱摘要、evidence 與 gaps。

## 證據與安全邊界

這個 skill 不從 repository contents 推測活動。Authentication 缺失、identity mismatch 或日期
範圍不明時會停止。它不尋找 credentials，也不輸出 tokens、完整 API payload 或未由使用者
提供的 private repository URLs。

## 工具入口

- [`scripts/collect_activity.py`](scripts/collect_activity.py)：收集與正規化 GitLab／GitHub
  activity。
- [`scripts/test_collect_activity.py`](scripts/test_collect_activity.py)：collector regression tests。

查看 collector 參數：

```bash
python3 scripts/collect_activity.py --help
```

## 輸出

輸出依日期排列。每一天只寫 evidence 支持的活動；沒有資料、資料不足或使用 fallback 時會
直接標示，不會補寫看似合理但沒有證據的內容。
