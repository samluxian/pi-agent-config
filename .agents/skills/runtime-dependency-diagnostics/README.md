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
4. 分開 observed mechanism、immediate trigger、source-proven design factor 與 incident causality。
5. 讀 source 前，先把 running image 對應到 deployed revision。
6. 用健康基準、較早故障或相同 artifact/config 比較，主動尋找反證。
7. 第一個 failure edge 成立或下一個 decisive check 明確後停止。

## 入口

- [`references/helper-routing.md`](references/helper-routing.md)：依 symptom 選 helper。
- [`references/transient-request-incidents.md`](references/transient-request-incidents.md)：5XX、timeout、LB/NEG、Pod、HPA 與 events。
- [`references/source-runtime-contract.md`](references/source-runtime-contract.md)：deployed image、source mapping、反證與證據分級。
- [`references/incident-report-contract.md`](references/incident-report-contract.md)：RD 報告的因果表述與品質 gate。
- [`assets/runtime-incident-report-template.md`](assets/runtime-incident-report-template.md)：使用者要求報告時才載入的模板。
- [`references/dependency-checks.md`](references/dependency-checks.md)：identity、Secret Manager reference、database、queue、cache 與 storage。
- [`references/runtime-incident-patterns.md`](references/runtime-incident-patterns.md)：重複 incident signatures。
- [`scripts/runtime_dependency_snapshot.sh`](scripts/runtime_dependency_snapshot.sh)：runtime dependency 摘要。
- [`scripts/k8s_pod_failure_summary.sh`](scripts/k8s_pod_failure_summary.sh)：Pod/container/events 摘要。
- [`scripts/runtime_desired_state_inventory.sh`](scripts/runtime_desired_state_inventory.sh)：local desired-state wiring。

## 輸出

一般診斷輸出會分開 first failing edge、observed mechanism、immediate trigger、source-proven
design factor、incident-causality grade、反證、uncertainty 與 fix surface。使用者要求 RD 報告時，
才讀取 report contract 與模板；模板不會加入每次診斷的 context。

Runtime snapshot 會從精確 Deployment 或 Service 的 live selector 找 Pod 與 ServiceAccount，事件
只查目標物件。Pod failure helper 預設不讀 application logs；加入 `--logs` 後才以時間、行數與
bytes 上限讀取，並只在有 restart／terminated state 時查 previous logs。
