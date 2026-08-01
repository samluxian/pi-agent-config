# AileAI 全端服務拓撲

## 範圍

本文件整理 AileAI 服務流量在本機 source repo 與 GitOps desired state 中的證據。這裡描述的是 repo/desired-state 顯示的預期接線，不代表 live cluster 現況。

已檢查路徑：

- `/home/samlu/devops-repos/k8s-deploy/aileai`
- `/home/samlu/devops-repos/ai-gateway`
- `/home/samlu/devops-repos/assetmanagementservice`
- `/home/samlu/devops-repos/brainhub`
- `/home/samlu/devops-repos/datasynchub`
- `/home/samlu/devops-repos/insighthub`
- `/home/samlu/devops-repos/tenants`

## 整體流向

```text
external client
  -> ai-gateway
    -> tenants
    -> asset-management-service
    -> brainhub
    -> insighthub
    -> data-sync-hub

asset-management-service
  -> GCS bucket
  -> Redis
  -> Gemini / LLM file index flow
  -> Pub/Sub topic aileai-dsh
  -> data-sync-hub by event/data flow

brainhub
  -> asset-management-service
  -> data-sync-hub
  -> Pub/Sub topic aileai-dsh
  -> MongoDB Atlas / file index / semantic cache / LLM providers

data-sync-hub
  -> MariaDB / DSH DB
  -> MongoDB Atlas vector store
  -> Weaviate-compatible vector endpoint
  -> Pub/Sub subscriptions on aileai-dsh
  -> brainhub for vector/LLM-related callbacks in configured paths

insighthub
  -> data-sync-hub

tenants
  -> data-sync-hub
  -> Redis
  -> LLM binding/config data
```

## 部署與 Desired State

六個核心服務都在 `k8s-deploy/aileai/<service>` 有 GitOps desired state。desired-state inventory 顯示這些服務共用 Helm dependency `stable:3.0.2`，service port 為 `8087`。

| Service | Source repo | Desired-state path | Image repository |
| --- | --- | --- | --- |
| `ai-gateway` | `/home/samlu/devops-repos/ai-gateway` | `k8s-deploy/aileai/ai-gateway` | `asia-docker.pkg.dev/aile-infra/aileai-services/ai-gateway` |
| `asset-management-service` | `/home/samlu/devops-repos/assetmanagementservice` | `k8s-deploy/aileai/asset-management-service` | `asia-docker.pkg.dev/aile-infra/aileai-services/asset-management-service` |
| `brainhub` | `/home/samlu/devops-repos/brainhub` | `k8s-deploy/aileai/brainhub` | `asia-docker.pkg.dev/aile-infra/aileai-services/brainhub` |
| `data-sync-hub` | `/home/samlu/devops-repos/datasynchub` | `k8s-deploy/aileai/data-sync-hub` | `asia-docker.pkg.dev/aile-infra/aileai-services/data-sync-hub` |
| `insighthub` | `/home/samlu/devops-repos/insighthub` | `k8s-deploy/aileai/insighthub` | `asia-docker.pkg.dev/aile-infra/aileai-services/insighthub` |
| `tenants` | `/home/samlu/devops-repos/tenants` | `k8s-deploy/aileai/tenants` | `asia-docker.pkg.dev/aile-infra/aileai-services/tenants` |

每個服務都有 per-env image tag、GSA annotation、Secret Manager remoteRef，分散在 `values.dev.yaml`、`values.qa.yaml`、`values.uat.yaml`、`values.prod.yaml`。沒有讀取 secret value。

## Gateway Routes

`ai-gateway` 是這張圖裡的對外入口。它把 tenant auth/check call 指到 `tenants.aileai.svc.cluster.local:8087`，並把 `system.data_service.baseUrl` 指到 `data-sync-hub`。

`ai-gateway/values.cm-config.yaml` 中的 desired gateway routes：

| 外部路徑 | 內部服務 | 內部 URI | 備註 |
| --- | --- | --- | --- |
| `/tenants/*` | `tenants.aileai.svc.cluster.local:8087` | `/v1/tenants/` | desired config 裡 `authorized: false` |
| `/attachments/*` | `asset-management-service.aileai.svc.cluster.local:8087` | `/v1/attachments/` | Asset/file APIs |
| `/omnichannel/*` | `brainHub.aileai.svc.cluster.local:8087` | `/v1/omnichannel/` | 有 `check: true` |
| `/brain/*` | `brainHub.aileai.svc.cluster.local:8087` | `/v1/brain/` | Brain routes |
| `/conversations/*` | `brainHub.aileai.svc.cluster.local:8087` | `/v1/conversations/` | Conversation APIs |
| `/insightHub/*` | `insightHub.aileai.svc.cluster.local:8087` | `/v1/insightHub/` | Insight metrics/query APIs |

## 服務責任與主要呼叫

### `ai-gateway`

主要責任：

- AileAI routes 的 external API gateway。
- 透過 `tenants` 做 tenant auth/check。
- 把 route families reverse proxy 到 internal service DNS。
- 使用 project-level Pub/Sub config `aileai-dsh`。
- `system.data_service.baseUrl` 指向 `data-sync-hub`。

主要 downstream calls：

- `tenants`：`/v1/tenants/auth`、`/v1/tenants/check`。
- `asset-management-service`：`/attachments/*`。
- `brainhub`：`/omnichannel/*`、`/brain/*`、`/conversations/*`。
- `insighthub`：`/insightHub/*`。
- `data-sync-hub`：透過 `system.data_service.baseUrl`。

### `asset-management-service`

主要責任：

- Asset upload/download/file management。
- Document extraction 與 ingestion pipeline。
- GCS-backed file storage。
- File index 與 vectorization handoff。

desired state 與產品文件顯示的主要依賴：

- Per-env Redis addresses。
- GCS buckets：base `aileai-ams`，env buckets `aileai-ams-dev`、`aileai-ams-qa`、`aileai-ams-uat`、`aileai-ams-prod`。
- Secret Manager remoteRefs：`dev-asset-management-service`、`qa-asset-management-service`、`uat-asset-management-service`、`prod-asset-management-service`。
- Per-env GSA，例如 `dev-asset-management-service@aile-main-development.iam.gserviceaccount.com`。
- Pub/Sub/DataSyncHub flow：透過 `aileai-dsh` 與 DSH ingestion routes。
- Gemini/LLM file index config：用在 extraction 或 indexing path。

### `brainhub`

主要責任：

- AI conversation 與 omnichannel APIs。
- LLM routing、embeddings、file-index retrieval、memory、semantic cache、MCP 相關行為。

主要依賴：

- `asset-management-service`：attachment/file context。
- `data-sync-hub`：data/vector/file-index flows。
- Pub/Sub topic `aileai-dsh`。
- 與 AMS 相同 bucket family 的 GCS buckets，用於 file-related flows。
- MongoDB Atlas / managed fallback config，用於 file index。
- Redis/Valkey semantic cache。
- secrets/config overlays 裡的 LLM provider configs。

Gateway-facing route families：

- `/v1/omnichannel/`
- `/v1/brain/`
- `/v1/conversations/`

### `data-sync-hub`

主要責任：

- Central data synchronization 與 vector/data service。
- Consumes Pub/Sub events，依 routing key dispatch。
- 寫入/查詢 DSH database 與 vector stores。

主要依賴：

- Secret overlays 裡的 database links：`database.default.link`、`database.dsh.link`。
- Redis。
- Pub/Sub：
  - topic：`aileai-dsh`
  - subscription base：`aileai-dsh-sub`
  - deadletter topic：`aileai-dsh-deadletter`
  - filter：routing keys 以 `mariadb.` 或 `weaviate.` 開頭
- MongoDB Atlas vector store：
  - database `dsh`
  - collection `vectors`
  - vector/text index config
- Weaviate-compatible endpoint：
  - dev `weaviate.dev.svc:8080`
  - qa `weaviate.qa.svc:8080`
  - prod `weaviate.prod.svc:8080`
- BrainHub callback/base URL：`http://brainHub.aileai.svc.cluster.local:8087`。
- Vertex AI Search optional config：用於 GCS artifact import manifests。

### `insighthub`

主要責任：

- Metrics 與 insight query service。
- 讀取 metric formula/variable config，執行 insight query flow。

主要 downstream call：

- `data-sync-hub`，透過 `system.data_service.baseUrl`。
  desired default：`http://data-sync-hub.aileai.svc.cluster.local:8087`。

### `tenants`

主要責任：

- Tenant lifecycle、app key/auth、token issuance、tenant params、LLM bindings。

主要 inbound calls：

- `ai-gateway` 使用 `tenants` 做 tenant auth 與 check。
- `/tenants/*` external paths 透過 `ai-gateway` route 進來。

主要依賴：

- `data-sync-hub`：tenant data synchronization 與 shared data access。
- Redis/cache。
- LLM binding/config data。

## Runtime Dependency Summary

| Dependency | Used by | Notes |
| --- | --- | --- |
| Kubernetes Service DNS | all services | Desired config 使用 `*.aileai.svc.cluster.local:8087` 做 internal calls。 |
| Secret Manager remoteRef | all services | 每個 service/env 一個 remoteRef。未讀取 values。 |
| GSA / Workload Identity | all services | Desired state 裡每個 service/env 一個 GSA。 |
| Pub/Sub `aileai-dsh` | gateway, AMS, BrainHub, DSH, InsightHub, Tenants | DSH consume routing-key events；其他服務 publish 或透過 topic 協調。 |
| Pub/Sub deadletter `aileai-dsh-deadletter` | DSH | DSH subscription health check 需要確認。 |
| Redis / Valkey | AMS, BrainHub, DSH, Tenants | Redis addresses 在 desired config；BrainHub 另有 semantic-cache/Valkey 行為。 |
| MongoDB Atlas | DSH, BrainHub file index | DSH vector 與 file-index fallback paths。 |
| Weaviate-compatible endpoint | DSH, Tenants-related vector flows | Desired config 列出 per-env Weaviate hosts。 |
| GCS buckets | AMS, BrainHub, DSH Vertex import | AMS/BrainHub 使用 `aileai-ams-*`；DSH 可寫 Vertex import manifests。 |

## 證據命令

```bash
.agents/skills/runtime-dependency-ops/scripts/runtime_desired_state_inventory.sh \
  --root /home/samlu/devops-repos/k8s-deploy/aileai \
  --services ai-gateway,asset-management-service,brainhub,data-sync-hub,insighthub,tenants \
  --envs dev,qa,uat,prod

rg -n "routes:|baseUrl|pubsub|redis|mongoAtlas|weaviate|bucketName|remoteRef|iam.gke.io" \
  /home/samlu/devops-repos/k8s-deploy/aileai
```

## Live 待驗證項目

- 本文件不證明 pods healthy，也不證明 Argo CD 已 sync desired state。
- Pub/Sub health 需要 live topic/subscription/filter/deadletter/IAM checks。
- MongoDB/Redis/GCS health 需要 live 或 control-plane evidence。
- Gateway route reachability 需要 live Gateway/Ingress/LB 與 pod logs。
