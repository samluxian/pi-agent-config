# GitOps State Diagnostics

這個 skill 沿著 delivery evidence layers，比較 expected 與 actual，找出第一個有證據支持的
狀態差異。它是唯讀診斷流程，Agent contract 位於 [`SKILL.md`](SKILL.md)。

## 何時使用

- GitOps desired state 與 Helm render 不一致。
- Argo CD、Kubernetes 或 GitLab handoff 顯示異常。
- GCP prerequisite 可能阻礙 workload readiness。
- 使用者提供 diagnostic packet，希望定位第一個 divergence。

## 不適用

- 純 repository inventory；請使用 `gitops-repo-audit`。
- 已知 runtime dependency incident；請使用 `runtime-dependency-diagnostics`。
- Desired-state 實作或 MR 文案。

## Evidence flow

```text
application / CI
  → desired state / chart metadata
  → effective Helm render
  → Argo CD
  → Kubernetes live state
  → runtime / GCP prerequisites
```

流程不會預設掃描每一層。它從最接近 symptom 的 evidence 開始，只在具體 error、missing
field、mismatch 或 readiness claim 出現時擴大。

## 怎麼運作

1. 定義 expected behavior、actual symptom、service/environment、時間窗與近期變更。
2. 先分析使用者提供的 diagnostic packet。
3. 收集第一個相關 evidence layer 的 bounded summary。
4. 比較 expected/actual，指出 first divergence。
5. 說明哪一項 evidence 可以推翻目前判斷。
6. 原因成立或下一個 decisive check 明確後停止。

## 入口

- [`references/troubleshooting-matrix.md`](references/troubleshooting-matrix.md)：依 symptom 選擇最小 probe。
- [`scripts/diagnostics_flow.sh`](scripts/diagnostics_flow.sh)：固定 repository、Helm、manifest、
  pipeline、Argo CD 與 Workload Identity 摘要入口。
- [`assets/evidence-matrix-template.md`](assets/evidence-matrix-template.md)：expected/actual evidence 表。
- [`assets/render-checklist-template.md`](assets/render-checklist-template.md)：render 檢查清單。
- [`../../shared/gitops/scripts/`](../../shared/gitops/scripts/)：共用 repository preflight 與 Helm render helpers。

## 安全與輸出

這個 skill 不執行 mutation，也不讀取 Secret values 或完整 manifest/log dump。輸出包含
Finding、Evidence、Cause、Uncertainty 與一個安全的 Recommended action。
