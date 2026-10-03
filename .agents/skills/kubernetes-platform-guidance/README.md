# Kubernetes Platform Guidance

這個 skill 提供 Kubernetes 資源設定、workload、Helm／GitOps 關聯、平台交付與故障排查的
證據優先流程；詳細規則見 [`SKILL.md`](SKILL.md)。不限 platform 元件，service-owned
manifest／values 只在使用者指明其 owning repository 與修改範圍時處理。

## 流程

1. 區分解釋、診斷或 repository 修改；確認 context、namespace、環境、資源與 desired-state owner。
2. 依需要追查 manifest、chart、GitOps、CI、render、Argo CD、live object 與 runtime，
   不把 source／render 當成部署事實。
3. 診斷只做有範圍的唯讀查詢，比對預期與實際狀態，列出證據、假設與缺口。
4. 已授權的修改只動 owned repository files；驗證 syntax、適用的 render／discovery、
   repository tests 與最終 diff。不能執行叢集或遠端 mutation。

## 使用方法與官方建議

- [`references/kubernetes-best-practice-baseline.md`](references/kubernetes-best-practice-baseline.md)：
  researcher 查核的 Kubernetes 官方基準，涵蓋 requests/limits、probes、selectors、
  rollout/PDB、topology、autoscaling、Pod security、RBAC 與 NetworkPolicy；附官方來源。
- [`references/kubernetes-usage-and-validation.md`](references/kubernetes-usage-and-validation.md)：
  context/version 查核、症狀對應的唯讀證據、bounded logs／metrics，以及
  schema、render、admission、controller、runtime 各層驗證的限制。
- [`references/gke-platform-guidance.md`](references/gke-platform-guidance.md)：選讀的 Google Cloud
  官方建議，區分 Standard／Autopilot、admitted resources、Workload Identity Federation、
  dataplane 與 upgrade 行為；不把 GKE 慣例套到其他叢集。
- PDB 不保證所有中斷或 rollout 的可用性；NetworkPolicy 有宣告不代表已生效。
  `kubectl diff`／server dry-run 需要 write-equivalent 授權，不當成純唯讀驗證；
  不執行 exec/debug、建立測試 Pod、讀 Secret 或輸出 raw kubeconfig。

## 特定情境參考

[`references/keda-implementation.md`](references/keda-implementation.md) 只適用於對應
KEDA platform installation／prerequisite，其他 chart 行為交由
[`helm-chart-best-practices`](../helm-chart-best-practices/SKILL.md) 判斷。使用目標 repository
自有的 preflight 與 render 工具（若有）。報告需分開已驗證與尚未驗證的 runtime 狀態。
