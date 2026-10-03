# Helm Chart Best Practices

這個 skill 提供一般 Helm chart 與 chart consumer 的 values、schema、templates、
dependencies、render、相容性和 release 流程；詳細規則見 [`SKILL.md`](SKILL.md)。
不預設 chart 必須共用，也不預設會渲染 Deployment、KEDA 或特定 GitOps 資源。

## 流程

1. 確認 chart／consumer owner、repository、branch、版本及目標環境；讀 Chart.yaml、
   dependencies、values、schema（若有）、templates、tests 與 consumers。
2. 追查 effective values 到 rendered manifests，辨識 default、wrapper、service 與
   GitOps 注入值；釐清 public API、相容性與 migration。
3. 對已授權檔案做最小修改；用目標 repository 支援的 lint、schema、helm template、
   正／負向案例與適用的 consumer profiles 驗證實際 changed behavior。
4. Release note 依 exact source/tag diff 與驗證證據撰寫；render 不代表 live readiness。

## 使用方法與官方建議

- [`references/helm-chart-best-practice-baseline.md`](references/helm-chart-best-practice-baseline.md)：
  researcher 查核的 Helm 官方建議，涵蓋 chart／app version、values/schema、helpers、
  dependency lock、globals、穩定 selectors、RBAC、CRD 與 hook lifecycle；附官方來源。
- [`references/helm-usage-and-validation.md`](references/helm-usage-and-validation.md)：
  lint／template 能證明什麼、dependency build／update 的副作用、版本與 capabilities
  假設，以及 defaults、profiles、consumer、正／負向 render 的驗證方式。
- 官方 best practice 不等於所有 chart 的強制規則；沿用 target 支援的 Helm 版本與
  repository contract，不順便改 chart format、values API 或 release 流程。
- `helm test` 會執行叢集測試資源；install／upgrade dry-run 不是預設本機驗證。
  本機 render 不證明 API admission、CRD/hook 執行或 live readiness，輸出也可能含秘密。

## 特定情境參考

- [`references/api-and-values-contract.md`](references/api-and-values-contract.md)、
  [`references/compatibility-and-review.md`](references/compatibility-and-review.md)：有相同 application-chart contract 時使用。
- [`references/keda-autoscaling-contract.md`](references/keda-autoscaling-contract.md)：適用的 KEDA 功能。
- [`references/release-notes.md`](references/release-notes.md)：共用 chart release。
- [`references/validation.md`](references/validation.md) 與
  [`scripts/render_summary.sh`](scripts/render_summary.sh)：application-chart 專用 render matrix／摘要工具；
  其他 chart 依自身資源種類與約定驗證，不套用固定環境或 helper。

不執行 mutating Helm／kubectl／Argo CD 操作，不讀 secrets；只修改核准且 owned 的 repository files。
