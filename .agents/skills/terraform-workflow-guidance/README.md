# Terraform Workflow Guidance

這個 skill 提供跨 repository 的 Terraform 閱讀、設計、修改與 plan review 流程；
詳細規則見 [`SKILL.md`](SKILL.md)。新 repository 先查 root layout、backend、
state ownership、provider、CI 與安全的驗證方式，不能直接套用既有 Google Cloud adapter。

## 流程

1. 區分查詢、plan review 或已授權的 edit；確認 exact root／environment、branch 與 ownership。
2. 追蹤 variables → locals → modules/resources → outputs → state address，辨識預期變更與替換順序。
3. 修改前界定檔案、相容性、state／IAM／network 風險與驗證；僅在允許的 repository branch
   執行最小修改。
4. 對受影響 root 執行該 repository 適用的 fmt、validate 與安全的 unsaved plan；不能
   安全取得 backend／provider evidence 時標示缺口，不把 fmt 視為 plan 通過。
5. 只回報 plan action summary、unexpected drift、關鍵 unknown 與 CI 比對，不輸出 secrets／state。

## 使用方法與官方建議

- 一般 CLI 與驗證方式見
  [`references/terraform-usage-and-validation.md`](references/terraform-usage-and-validation.md)：
  init 的副作用、fmt／validate／plan 各自能證明什麼、provider lock 與 module version、
  plan-only／mock test 的限制，以及 sensitive／ephemeral／write-only 的差異。
- Google Cloud baseline 依 researcher 查核的 Google 與 HashiCorp 官方文件整理；
  參考文件附來源。設計、review 時只比較適用建議，不強制改用 GCS backend、
  environment branches 或特定 var-file 流程，也不把官方建議當成 target 已部署的證據。
- `terraform test` 預設可能 apply；使用前必須確認所有 run 與 wrapper 不會修改基礎設施。
  `terraform_remote_state` 的 output consumer 可能有完整 state 的讀取權限，需先確認授權邊界。

## 特定情境參考

- [`references/repo-map.md`](references/repo-map.md) 與
  [`scripts/terraform_repository_preflight.sh`](scripts/terraform_repository_preflight.sh)：只用於相符的既有 repository layout。
- [`references/google-cloud-terraform-best-practices.md`](references/google-cloud-terraform-best-practices.md)、
  [`references/iam-review-checklist.md`](references/iam-review-checklist.md) 與
  [`references/firewall-review-checklist.md`](references/firewall-review-checklist.md)：相關雲端、IAM、network 情境。
- [`references/plan-replacement-review.md`](references/plan-replacement-review.md) 與
  [`references/state-handoffs-and-recovery.md`](references/state-handoffs-and-recovery.md)：replacement 或 state handoff 風險。
- [`references/beginner-runbook.md`](references/beginner-runbook.md)：基本 plan 解讀；其中 bucket retirement 僅適用於其特定資源。
- [`scripts/summarize_terraform_plan.py`](scripts/summarize_terraform_plan.py)：適用於其支援的文字 plan 格式。

Agent 不執行 apply、import、state／workspace mutation、遠端 Git 或 GCP 變更。
