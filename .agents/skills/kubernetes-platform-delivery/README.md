# Kubernetes Platform Delivery

這個 skill 維護 Kubernetes platform desired state，包括 bootstrap、infrastructure charts 與
platform CI。它不處理 service-owned values。Agent contract 位於 [`SKILL.md`](SKILL.md)。

## 何時使用

- 修改 App-of-Apps 或 bootstrap discovery。
- 新增或調整 platform/infrastructure component。
- 修改 platform CI handoff。
- 在已批准範圍內加入 KEDA platform prerequisite。

## 不適用

- Service wrapper、service values 或 application config；請使用 `gitops-service-delivery`。
- Shared chart API；請使用 `shared-helm-chart-maintenance`。
- 唯讀狀態 diagnosis；請使用 `gitops-state-diagnostics`。

## 怎麼運作

1. 確認 target repository、branch、environment、component 與 desired-state owner。
2. 分開 bootstrap、infrastructure chart、CI、render 與 live evidence。
3. 讀 target files、callers、defaults、templates、schemas 與一個相關 pattern。
4. 從 repository evidence 確認 discovery path、project、namespace、revision、sync policy 與
   dependency prerequisites。
5. 提出精確 patch；scope 變成 IAM、CI、bootstrap 或其他 component 時重新確認。
6. 執行最小修改，驗證 syntax、discovery、render 與 bounded diff/status。

## Ownership 邊界

Platform approval 不會自動涵蓋相鄰服務、shared chart API、IAM 或 live mutation。若驗證發現
問題實際屬於 service configuration 或 shared chart，流程會停止並轉交對應 skill。

## 入口

- [`references/keda-implementation.md`](references/keda-implementation.md)：只有 scope 明確包含
  KEDA installation/prerequisites 時才讀取。
- [`../../shared/gitops/scripts/`](../../shared/gitops/scripts/)：共用 repository preflight 與
  compact Helm render helpers。

## Domain evidence

Workspace report 需補充 affected platform files、bootstrap、infrastructure、IAM、CI、
compatibility 與 runtime findings。部署本身仍由既有 MR、CI 與 GitOps reconciliation 完成。
