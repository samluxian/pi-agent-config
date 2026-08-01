# newaile-dev L4 LoadBalancer `UpdatedLoadBalancer` 調查報告

日期：2026-06-12

## 摘要

`newaile` namespace 內的 `Service/aile-service-gateway-sv` 持續出現下列事件：

```text
UpdatedLoadBalancer ... service-controller ... Updated load balancer with new hosts
```

本次調查結論是：這不是 `aile-service-gateway` Pod 重啟造成，也不是主要由 NEG 造成。真正原因是 `newaile-dev` cluster 開啟了 GKE Cluster Autoscaler / Node Auto-Provisioning，且 autoscaling profile 是 `Optimize utilization`，導致 node 被頻繁 scale up、drain、scale down 與移除。因為 `aile-service-gateway-sv` 是 L4 `LoadBalancer` Service，GKE 需要跟著更新它背後 target pool 的 node membership，所以 Service event 累積出現 `UpdatedLoadBalancer`。

核心因果鏈如下：

```text
GKE Optimize utilization / NAP
-> node 頻繁 scale up / scale down
-> L4 LoadBalancer target pool 的 node membership 變動
-> GKE service-controller 更新 LoadBalancer hosts
-> Service event 出現 UpdatedLoadBalancer
```

## 影響範圍

- `aile-service-gateway-sv` 和 `nacos` 都出現 `UpdatedLoadBalancer`，因為兩者都是 `type=LoadBalancer` Service。
- 調查期間 `aile-service-gateway` Pod 沒有重啟。
- 調查期間 `aile-service-gateway-sv` 的 Service endpoints 是有效且 Ready 的。
- 部分非 gateway workload 在 autoscaler scale-down 時被搬移。最明顯的例子是 `aileai/tenants`。

## Layer 1：Service 證據

來源指令：

```bash
kubectl describe svc aile-service-gateway-sv -n newaile
```

觀察到的欄位：

```text
Type:                     LoadBalancer
Desired LoadBalancer IP:  34.80.128.136
LoadBalancer Ingress:     34.80.128.136 (VIP)
NodePort:                 http 32239/TCP
NodePort:                 https 30132/TCP
External Traffic Policy:  Cluster
Annotations:
  cloud.google.com/neg: {"exposed_ports": {"80":{}}}
  networking.gke.io/target-pool: aa320a02681ac48afa22b4dc59957c43
Events:
  UpdatedLoadBalancer ... Updated load balancer with new hosts
```

解讀：

- `type=LoadBalancer` 表示 GKE 會替這個 Service 管理一條 GCP L4 LoadBalancer。
- `networking.gke.io/target-pool` 指向這條 L4 LoadBalancer 使用的 GCP target pool。
- `External Traffic Policy: Cluster` 加上 `NodePort` 代表外部流量會先進 GCP L4 LB，再打到 GKE node 的 NodePort，最後由 kube-proxy 轉到實際 Pod。
- `cloud.google.com/neg` 雖然存在，但 `UpdatedLoadBalancer` 這個事件來自 Service LoadBalancer controller 路徑，不是 NEG controller 路徑。

## Layer 2：Gateway Pod 與 Endpoint 證據

來源指令：

```bash
kubectl get pods -n newaile -o wide | awk 'NR==1 || /aile-service-gateway|nacos/'

kubectl get endpointslice -n newaile \
  -l kubernetes.io/service-name=aile-service-gateway-sv \
  -o jsonpath='{range .items[*].endpoints[*]}gateway endpoint {.addresses} node={.nodeName} ready={.conditions.ready}{"\n"}{end}'
```

觀察到的 gateway / nacos 位置：

```text
aile-service-gateway-84b96ddb5-68kq9  Running  RESTARTS 0  node ...-5f6a4bb7-c8bj
aile-service-gateway-84b96ddb5-825hp  Running  RESTARTS 0  node ...-02952f79-dvhb
nacos-6887c5c4f5-8lr8z                Running  RESTARTS 0  node ...-5f6a4bb7-c8bj
```

觀察到的 gateway endpoints：

```text
gateway endpoint ["172.20.4.18"] node=...-02952f79-dvhb ready=true
gateway endpoint ["172.20.1.81"] node=...-5f6a4bb7-c8bj ready=true
```

解讀：

- Gateway Pod 是健康的，且沒有重啟。
- `nacos` 跟其中一個 gateway Pod 位於同一台 node，但兩者都維持 Running。
- Service endpoint 清單不是故障來源。事件噪音出現在 L4 LoadBalancer target pool 層。

## Layer 3：Target Pool 證據

來源指令：

```bash
gcloud compute target-pools describe aa320a02681ac48afa22b4dc59957c43 \
  --region asia-east1 \
  --project aile-main-development \
  --format='yaml(name,instances,healthChecks)'
```

觀察到的 target pool：

```text
name: aa320a02681ac48afa22b4dc59957c43
healthChecks:
- https://www.googleapis.com/compute/v1/projects/aile-main-development/global/httpHealthChecks/k8s-baec6eb880195b61-node
instances:
- .../zones/asia-east1-a/instances/gk3-newaile-dev-nap-1c4y3csb-5f6a4bb7-c8bj
- .../zones/asia-east1-c/instances/gk3-newaile-dev-nap-1c4y3csb-02952f79-dvhb
- other GKE node instances
```

解讀：

- target pool 裡放的是 GKE node instance，不是 Pod IP。
- 當 GKE node 新增或移除時，target pool membership 會跟著變。
- `Updated load balancer with new hosts` 的意思是 GKE 更新 LoadBalancer 的 host membership。這可能包含新增 host、移除 host，或重新 reconcile host 清單；不是只代表新增 node。

## Layer 4：Cluster Autoscaler 與 Node Churn 證據

來源指令：

```bash
kubectl get nodes -L topology.kubernetes.io/zone
```

觀察到的 node churn 範例：

```text
gk3-...-02952f79-q2lc   NotReady,SchedulingDisabled   AGE 64m   asia-east1-c
gk3-...-5f6a4bb7-zjzh   Ready,SchedulingDisabled      AGE 13m   asia-east1-a
gk3-...-5f6a4bb7-w2lz   Ready                         AGE 3m58s asia-east1-a
gk3-...-c40007dd-4c5w   Ready                         AGE 3m54s asia-east1-b
gk3-...-c40007dd-f9zk   Ready                         AGE 24s   asia-east1-b
```

解讀：

- 有些 node 正在 drain 或移除。
- 有些 node 是剛建立的。
- 這直接證明 Service event 增加期間，cluster 的 node set 並不穩定。

來源指令：

```bash
kubectl describe configmap cluster-autoscaler-status -n kube-system
```

觀察到的 autoscaler events：

```text
ScaleDownEmpty  Scale-down: empty node ... removed
ScaleDown       Scale-down: removing node ..., utilization: ...
ScaledUpGroup   Scale-up: setting group ... size to 7 instead of 6
ScaledUpGroup   (combined from similar events): Scale-up: group ... size set to 6 instead of 5
ScaleDownEmpty  113s (x466 over 13h)
ScaledUpGroup   x189 over 13h
```

解讀：

- `ScaleDownEmpty` 表示 autoscaler 找到不需要保留 workload 的空 node，並將該 node 移除。
- `ScaleDown` 且出現 `pods to reschedule` 表示 autoscaler drain 可搬移的 Pod，然後移除 node。
- `ScaledUpGroup` 表示 autoscaler 增加 managed instance group 的 size。
- 多小時內反覆出現的累積次數表示這是 autoscaler oscillation，不是單次事件。

## Layer 5：GKE Cluster 設定證據

來源指令：

```bash
gcloud container clusters describe newaile-dev \
  --region asia-east1 \
  --project aile-main-development \
  --format='yaml(autoscaling,nodePools[].name,nodePools[].autoscaling,nodePools[].management,nodePools[].status)'
```

觀察到的 cluster 設定：

```text
autoscaling:
  autoscalingProfile: OPTIMIZE_UTILIZATION
  enableNodeAutoprovisioning: true
nodePools:
- name: nap-1c4y3csb
  autoscaling:
    autoprovisioned: true
    enabled: true
    maxNodeCount: 1000
  management:
    autoRepair: true
    autoUpgrade: true
```

Console 位置：

```text
Google Cloud Console
-> Kubernetes Engine
-> Clusters
-> newaile-dev
-> Automation
-> Optimize utilization
```

解讀：

- `Optimize utilization` 是 cluster 層級 autoscaling profile，不是 Service 設定。
- Node Auto-Provisioning 可以自動建立或移除 node capacity。
- 這組設定比保守且固定的 node pool 策略更容易積極整理 node 使用率。

## Layer 6：Workload Rescheduling 證據

來源指令：

```bash
kubectl get deploy,rs,pod,hpa,pdb -n aileai | grep tenants

kubectl describe pod -n aileai tenants-5f4d4d8b79-lbj9z
```

觀察到的 `tenants` 狀態：

```text
deployment.apps/tenants  2/2
horizontalpodautoscaler.autoscaling/tenants  cpu: 1%/80%  min 2  max 3  replicas 2
poddisruptionbudget.policy/tenants  minAvailable 1
```

觀察到的 `tenants` Pod scheduling：

```text
Scheduled  gke.io/optimize-utilization-scheduler
Successfully assigned aileai/tenants-5f4d4d8b79-lbj9z to ...-5f6a4bb7-w2lz
```

觀察到的 resource requests：

```text
Requests:
  cpu: 500m
  memory: 2Gi
  ephemeral-storage: 1Gi
```

解讀：

- `tenants` 不是因為 HPA 壓力而擴容。CPU 很低，replica 也維持 2。
- 一個 `tenants` Pod 被 `gke.io/optimize-utilization-scheduler` 重新排程。
- autoscaler events 也在 `pods to reschedule` 中點名 `tenants`。
- 因此 `tenants` 是 optimize-utilization consolidation 過程中被搬移的 workload 證據，不代表 `tenants` 本身故障。

## 這不是什麼問題

這不是主要的 NEG 問題。

- `Attach` / `Detach` 這類 NEG events 屬於另一個層次。
- 移除 `cloud.google.com/neg` 不會停止 `UpdatedLoadBalancer`，因為 `UpdatedLoadBalancer` 是 L4 LoadBalancer target pool 路徑造成。

這不是 `aile-service-gateway` Pod 重啟的證據。

- 調查期間 Gateway Pods 是 Running，restart count 為 0。
- Service Endpoints 是 Ready。

這不是 `Service` values bug。

- 這個 Service 預期就是 `type=LoadBalancer`。
- 正式入口是 L4 LoadBalancer IP。

## 根因陳述

`aile-service-gateway-sv` 頻繁出現 `UpdatedLoadBalancer`，是因為 `newaile-dev` 使用 GKE Cluster Autoscaler / Node Auto-Provisioning 並啟用 `Optimize utilization`，造成 node group 頻繁 scale up、scale down 與 workload rescheduling。由於 `aile-service-gateway-sv` 是 L4 `LoadBalancer` Service，背後是 GCP target pool 裡的 GKE nodes，node membership 變動時 GKE 就會更新 LoadBalancer hosts。

## 建議後續

1. 把 `UpdatedLoadBalancer` 視為 cluster node churn 的症狀，不要視為 gateway Pod 故障。
2. 如果 dev 環境可以接受 event noise 與 node churn，Service 不需要修改。
3. 如果需要更穩定的 L4 LoadBalancer target pool，建議與 GKE / infra owner 討論 cluster 層級調整：
   - 將 autoscaling profile 從 `Optimize utilization` 改成較保守的 profile，例如 `Balanced`。
   - 降低重要 workload 對 Node Auto-Provisioning 的依賴。
   - 將重要 L4 LoadBalancer 相關 workload 放到較穩定、具備合理 minimum capacity 的 node pool。
4. 持續分開處理 L4 Service 與 NEG/L7 backend chain。移除 NEG 可能減少 NEG 相關事件，但不能解決 `UpdatedLoadBalancer`。

## 後續複查指令

觀察 Service events：

```bash
kubectl get events -n newaile \
  --field-selector involvedObject.kind=Service,involvedObject.name=aile-service-gateway-sv \
  --sort-by=.lastTimestamp
```

觀察 node readiness 與 drain 狀態：

```bash
kubectl get nodes -o 'custom-columns=NAME:.metadata.name,UNSCHEDULABLE:.spec.unschedulable,READY:.status.conditions[-1].status' | sort
```

顯示 node zone：

```bash
kubectl get nodes -L topology.kubernetes.io/zone
```

顯示 autoscaler events：

```bash
kubectl describe configmap cluster-autoscaler-status -n kube-system
```

顯示 target pool membership：

```bash
gcloud compute target-pools describe aa320a02681ac48afa22b4dc59957c43 \
  --region asia-east1 \
  --project aile-main-development \
  --format='value(instances.basename())' | sort
```

顯示最近 scale-up scheduling 證據：

```bash
kubectl get events -A --sort-by=.lastTimestamp \
  | grep -E 'FailedScheduling|TriggeredScaleUp|NotTriggerScaleUp|ScaledUpGroup' \
  | tail -80
```

顯示最近建立的非系統 Pods：

```bash
kubectl get pods -A --sort-by=.metadata.creationTimestamp -o wide \
  | grep -vE 'kube-system|gke-gmp-system|gke-managed|kube-public|kube-node-lease' \
  | tail -80
```
