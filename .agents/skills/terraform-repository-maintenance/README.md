# Terraform Repository Maintenance

這個 skill 用 plan-first 流程檢查、說明、review 或維護 Terraform repository。GCP、remote state
與 Git remotes 維持唯讀；Agent contract 位於 [`SKILL.md`](SKILL.md)。

## 支援的 adapter

目前只支援本 skill 所定義的 Terraform repository contract。通用名稱不代表支援任意 Terraform layout；
其他 repository 必須先定義 root layout、backend、commands、ownership 與 review adapter。

## 何時使用

- 解釋 supported repository root、variables、modules、resources、outputs 或 state addresses。
- Review Terraform plan、replacement、destroy risk 或 unexpected drift。
- 規劃 `google_storage_bucket` 的 retirement，確認 state policy、物件保留與 `force_destroy`。
- 維護 GCP IAM、Workload Identity、network、VM、Secret Manager references 或 state handoff。
- 在已批准 root/environment 內進行小範圍 Terraform 修改。

## 不適用

- 其他 Terraform repository。
- Runtime incident diagnosis。
- Terraform apply、import、state mutation 或 workspace mutation。
- 未指明 root、environment、backend 或 ownership 的修改。

## 怎麼運作

1. 確認 repository、editable roots、service/environment、branch/status、backend 與 task type。
2. 執行 preflight，讀 repo map，並比較同 family 的既有 root。
3. 追蹤 variables → locals → modules/resources → outputs → state address。
4. 分開官方 guidance、repository policy、current implementation 與 remote plan evidence。
5. 修改前提出 exact files、plan expectation、IAM/network/state risk 與 validation。
6. 保留 state addresses、`for_each` keys 與 infrastructure identifiers。
7. 每個 affected root/environment 由 parent 或 approved worker 執行 fmt、validation 與 unsaved local plan。
8. Resource rename 或 immutable-field replacement 會檢查 active references 與 `+/-`、`-/+` 執行順序；不安全的 destroy-first plan 會停止。
9. Plan evidence 只保留 resource address、action order、decision fields、warnings/errors 與 action summary。
10. MR 或 pipeline identifier 已知時，讀取實際 GitLab pipeline 與 plan job，分開回報 CI plan 和 local plan；不會 retry、trigger、approve、merge 或 apply。

## 入口

- [`references/repo-map.md`](references/repo-map.md)：supported layout、backend 與 ownership。
- [`references/beginner-runbook.md`](references/beginner-runbook.md)：plan-first 操作說明與 Google Cloud Storage bucket retirement preflight。
- [`references/google-cloud-terraform-best-practices.md`](references/google-cloud-terraform-best-practices.md)：Google Cloud baseline。
- [`references/state-handoffs-and-recovery.md`](references/state-handoffs-and-recovery.md)：import、state handoff、saved plan 與 partial failure。
- [`references/plan-replacement-review.md`](references/plan-replacement-review.md)：replacement ordering、active references 與 compact plan evidence。
- [`references/iam-review-checklist.md`](references/iam-review-checklist.md)：IAM 與 Workload Identity review。
- [`references/firewall-review-checklist.md`](references/firewall-review-checklist.md)：network/firewall review。
- [`scripts/terraform_repository_preflight.sh`](scripts/terraform_repository_preflight.sh)：repository、roots、fmt 與 change preflight。
- [`scripts/summarize_terraform_plan.py`](scripts/summarize_terraform_plan.py)：將完整文字 plan 壓縮成 bounded replacement evidence；`--json` 會輸出含 completeness、action counts、resource-header consistency 與 replacement order 的 `terraform-plan-summary/v1`。

## Plan 與 secret 邊界

Plan 只針對 task 內列出的 exact root/environment。Authentication 或 state lock failure 不會自動
重試。輸出只保留 add/change/destroy/replace summary 與 unexpected drift，不列印 sensitive plan、
state、credentials 或 secret values。

## Domain evidence

Workspace report 需列出每個 affected root/service/environment、fmt/validate/local-plan status、
add/change/destroy/replace counts、unexpected drift、important unknowns，以及 IAM、network、
state、replacement 與 runtime findings。GitLab pipeline evidence 存在時，也會列出 pipeline、
plan job、commit SHA，並比對 CI plan 與 local plan。`No changes.` 或明確 zero-action summary
才能支持 no-op 結論。
