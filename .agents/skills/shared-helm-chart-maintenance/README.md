# Shared Helm Chart Maintenance

這個 skill 維護 shared Helm chart 的 values API、schema、templates、相容性與 release evidence。
Chart values 和 templates 視為 public contract。Agent 執行規則以 [`SKILL.md`](SKILL.md)
為準。

## 支援的 adapter

目前只支援本 skill 所定義的 shared application-chart contract。通用名稱不代表支援任意 chart；其他 chart 必須先定義
values、render、compatibility 與 test adapter。

## 何時使用

- 修改 shared values defaults 或 JSON schema。
- 修改 templates、helpers、selectors、globals 或 KEDA contract。
- 評估 breaking change、migration 與 consumer compatibility。
- 根據 exact tag diff 與 validation evidence 撰寫 release notes。

## 不適用

- Service-owned values 或 app-config；請使用 `gitops-service-delivery`。
- Wrapper dependency upgrade；請使用 `helm-dependency-upgrade`。
- 只修改單一 consumer repository。

## 怎麼運作

1. 確認 chart repository、branch、current version、requested behavior 與 consumers。
2. 檢查 values、schema、templates、helpers、tests 與 reference consumers。
3. 分類 public API、KEDA、compatibility、release note 與 validation ownership。
4. 比對 values、schema、templates、selectors、globals 與 rendered behavior。
5. 提出精確檔案、migration、compatibility、validation 與 release impact。
6. 執行最小修改，驗證受影響 profiles 與代表性 consumers。

## 入口

- [`references/api-and-values-contract.md`](references/api-and-values-contract.md)：public API、defaults 與 globals。
- [`references/keda-autoscaling-contract.md`](references/keda-autoscaling-contract.md)：KEDA/HPA behavior。
- [`references/compatibility-and-review.md`](references/compatibility-and-review.md)：consumer compatibility。
- [`references/release-notes.md`](references/release-notes.md)：tag diff 與 release evidence。
- [`references/validation.md`](references/validation.md)：lint、schema、render 與 consumer matrix。
- [`scripts/render_summary.sh`](scripts/render_summary.sh)：bounded rendered-resource summary。

## Evidence boundary

Release notes 是 intent evidence，不是 deployment truth。Compatibility claim 必須同時對照
exact source、effective values、render 與適用的 consumer evidence；不能只靠 commit title 或
lint success 宣稱安全。

## 輸出

輸出包含 contract change、defaults/consumer/migration status、validation、KEDA/app-of-apps/
rollout risk 與一個下一步。
