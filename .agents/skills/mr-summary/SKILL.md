---
name: mr-summary
description: 依 repository evidence 撰寫繁體中文 MR 標題、描述、branch notes 或跨 repository handoff。Use for 使用者要求 MR 文案。Do not use for 實作、稽核、review 或疑難排解。
---

# MR Summary

根據 repository evidence 產出可直接貼到 GitLab 或 GitHub 的 MR 文案，
不得修改檔案，也不得宣稱未執行的驗證結果。

## 流程

1. 確認 target repository、comparison base、branch freshness、目標讀者、
   repository 數量、既有標題慣例與關聯 ticket。
2. 檢查 bounded evidence：status、changed-file summary、相關 diff hunks、
   必要的 commit history，以及使用者提供或 repository 記錄的驗證結果。
3. 從 ticket、文件或使用者說明確認變更背景與目的；evidence 無法支持「為什麼」
   時，先問一個簡短問題，不得從檔名或 diff 猜測。
4. 分開陳述事實與判斷。不得從意圖推論 runtime、deployment、IAM、CI 或
   compatibility 結果；跨 repository 變更須分清各 repository 的責任。
5. 產出前讀取 `assets/mr-summary-template.md`，依固定順序填寫所有章節。
   缺少 evidence 時標示「未提供」、「未執行」、「未評估」或「不適用」，
   不得省略章節或虛構內容。
6. 除非使用者要求分析，否則只回傳可直接使用的 MR 標題與內容。

## 語言與格式

- 輸出固定使用台灣繁體中文。
- 程式碼、命令、路徑、URL、API、設定鍵、resource name、角色名稱、
  error message 與其他 technical identifier 保持原文。
- 標題須簡短且具體；只有 evidence 存在時才加入 ticket ID。
- 驗證章節只列實際完成的檢查，未執行項目須寫明原因或缺口。
- Checklist 只能依 evidence 勾選；無法確認時維持未勾選。

## 安全與停止條件

不得修改 Git、GitLab、GitHub 或 repository 檔案。若 refs 可能過期，須說明
限制或請使用者先 fetch，再提出 comparison claim。不得讀取、複製或輸出秘密、
credential、private key、`.env` 值或其他敏感資料。

## 固定輸出順序

1. MR 標題
2. 關聯項目
3. 背景與目的
4. 變更內容
5. 驗證結果
6. 風險與影響
7. 部署與回復
8. Review 重點
9. 視覺或輸出佐證
10. 檢查清單
