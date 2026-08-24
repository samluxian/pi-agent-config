# Developer Activity Summary

這個 skill 從已驗證身分的 GitLab 或 GitHub 活動，整理指定日期範圍的 action-led 工作更新。
Agent 執行規則以 [`SKILL.md`](SKILL.md) 為準。

## 何時使用

- 撰寫每日工作紀錄或週報素材。
- 預設依 `Asia/Taipei` 切分日期，或依使用者明確指定的其他時區整理。
- Primary 平台資料不足時，要依指定 fallback window 補充另一個平台。

## 不適用

- 撰寫 MR 說明。
- Repository audit、實作或 troubleshooting。
- 績效評估或推測沒有 activity evidence 的工作。

## 怎麼運作

1. 確認 absolute dates、平台、輸出語言與 fallback 規則；timezone 預設為 `Asia/Taipei`。
2. 使用 authenticated `glab` 或 `gh` evidence 確認帳號身分。
3. 收集 commits、MRs/PRs、reviews、comments、issues 與 repository events。
4. 依指定 timezone 將活動放回 local calendar date。
5. 只在 primary evidence 不足時使用 fallback，並清楚標示來源。
6. 去除重複事件，以固定 Markdown 格式輸出每日 action-led 摘要與 MR／PR 連結。

## 證據與安全邊界

這個 skill 不從 repository contents 推測活動。Authentication 缺失、identity mismatch 或日期
範圍不明時會停止。它不尋找 credentials，也不輸出 tokens、完整 API payload 或 unrelated
private repository URLs。輸出只允許 authenticated activity evidence 直接回傳的對應 MR／PR
URL，不自行拼湊連結。

## 工具入口

- [`scripts/collect_activity.py`](scripts/collect_activity.py)：收集與正規化 GitLab／GitHub
  activity。
- [`scripts/test_collect_activity.py`](scripts/test_collect_activity.py)：collector regression tests。

查看 collector 參數：

```bash
python3 scripts/collect_activity.py --help
```

## 輸出

輸出依日期排列，固定使用以下 Markdown 格式：

```markdown
## 工作摘要與 MR

### 2026-08-24（今日）

- 完成 application deployment 設定整理：<br>
  [example-group/example-repository !154](https://gitlab.example/example-group/example-repository/-/merge_requests/154)（已合併）
- 更新 DevOps 簡報內容；只有 push evidence，沒有相對應 MR/PR。
```

連結與狀態必須來自 authenticated API evidence，不自行拼湊。GitLab 使用 `!IID`，GitHub
使用 `#number`；狀態統一顯示為「已合併」、「進行中」或「已關閉」。未提供日期標籤時，
省略日期後方括號。使用 fallback 時，將 identity、platform 與 window 附在對應項目；日期
沒有足夠資料時，直接標示「此日期沒有足夠 activity evidence，未補寫無證據內容。」

每一則工作更新以動作、成果或工作項目開頭，不使用「我完成」、「我們調整」、
「I completed」或「We reviewed」等句首。若使用者要求第一人稱語氣，可省略句首主詞，或把
人稱放在後文。每一天只寫 evidence 支持的活動，不補寫沒有證據的內容。
