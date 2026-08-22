# GitOps Repository Audit

這個 skill 只看 repository 內的靜態證據，檢查 discovery、values overlays、Chart metadata、
CI handoff 與 review readiness。Agent 執行規則以 [`SKILL.md`](SKILL.md) 為準。

## 何時使用

- 盤點 GitOps repository 結構與啟用環境。
- 檢查 values、chart dependency 或 bootstrap metadata 是否一致。
- 確認 CI 到 deployment repository 的 handoff 是否完整。
- 在 MR 前做 repository-only readiness review。

## 不適用

- 查詢 Argo CD、Kubernetes 或 GCP live state。
- 診斷正在發生的 runtime incident。
- 修改 values、charts 或 CI。
- 撰寫 MR 文案。

## 怎麼運作

1. 確認 repository、branch/status、service/environment 與 audit question。
2. 從 static audit reference 選一條 bounded route。
3. 讀取 target configuration 與一個相關 reference pattern。
4. 分開 source、desired state 與 generated/rendered evidence。
5. 視需要執行 tree inventory helper。
6. 每個 finding 都附 evidence、impact、confidence 與 remediation。

## 為什麼不和 diagnostics 合併

Audit 回答「repository 目前是否一致、是否準備好 review」。它不建立 live deployment truth。
若結論需要 expected-versus-actual、Argo CD 或 Kubernetes evidence，應轉交
`gitops-state-diagnostics`。

## 入口

- [`references/static-audit.md`](references/static-audit.md)：discovery、chart、values、CI 與
  readiness routes。
- [`scripts/audit_gitops_tree.sh`](scripts/audit_gitops_tree.sh)：bounded GitOps tree inventory。

## 輸出

輸出包含 scope、依 severity 排列的 findings、static validation、風險與一個下一步。只有
live state 才能證明的事情會列為 gap。
