# Runtime Dependency Diagnostics

這個 skill 從具體 symptom 出發，沿著 request path 與相鄰 dependencies，找出第一個有證據
支持的 runtime failure edge。它是唯讀 incident workflow，Agent contract 位於
[`SKILL.md`](SKILL.md)。

## 何時使用

- Kubernetes request 出現 5XX、timeout、startup failure 或 intermittent failure。
- 問題可能涉及 LB/NEG、Service、Pod、autoscaling、identity、database、queue、cache、storage
  或 worker。
- 已有明確 service、environment、症狀與時間窗。

## 不適用

- 一般 GitOps desired/live mismatch；請使用 `gitops-state-diagnostics`。
- 靜態 repository audit。
- 跨 repository architecture mapping。
- 直接修改 source、GitOps 或 live systems。

## Request path

```text
client / load balancer
  → Service / NEG
  → Pod
  → identity / config reference
  → dependency
  → worker / response
```

流程從 symptom 開始，只檢查相鄰 edges。沒有具體 error、timing gap、missing reference 或
health claim 時，不會無界限向外掃描。

## 怎麼運作

1. 固定 service、environment、symptom、time window 與 expected dependency path。
2. 先分析使用者提供的 evidence。
3. 比較 desired wiring、live reference/identity、control plane 與 bounded runtime evidence。
4. 找出 immediate trigger，並把 contributing design/source factor 分開。
5. 讀 source 前，先把 running image 對應到 deployed revision。
6. 第一個 failure edge 成立或下一個 decisive check 明確後停止。

## 入口

- [`references/helper-routing.md`](references/helper-routing.md)：依 symptom 選 helper。
- [`references/transient-request-incidents.md`](references/transient-request-incidents.md)：5XX、timeout、LB/NEG、Pod、HPA 與 events。
- [`references/source-runtime-contract.md`](references/source-runtime-contract.md)：deployed image 與 source mapping。
- [`references/dependency-checks.md`](references/dependency-checks.md)：identity、Secret Manager reference、database、queue、cache 與 storage。
- [`references/runtime-incident-patterns.md`](references/runtime-incident-patterns.md)：重複 incident signatures。
- [`scripts/runtime_dependency_snapshot.sh`](scripts/runtime_dependency_snapshot.sh)：runtime dependency 摘要。
- [`scripts/k8s_pod_failure_summary.sh`](scripts/k8s_pod_failure_summary.sh)：Pod/container/events 摘要。
- [`scripts/runtime_desired_state_inventory.sh`](scripts/runtime_desired_state_inventory.sh)：local desired-state wiring。

## 輸出

輸出包含 first failing edge、immediate trigger、evidence、contributing factor、uncertainty 與正確
fix surface。不會從 resource 名稱推測 dependency usage。
