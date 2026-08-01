# Springcloud Aile GitOps Migration Plan

## 背景

`springcloud-aile` 是 `newaile/aile-service-*` 系列微服務的 upstream monorepo。這次 migration 目標是把 gateway 以外的 Spring Cloud 微服務逐步移到 `k8s-deploy` / Argo CD 管理，同時保留 gateway 目前既有的部署路徑。

這不是單一 repo migration。需要同時處理：

- upstream CI 如何從 monorepo 判斷 changed services。
- `k8s-deploy` 如何一次更新多個 service 的 image tag。
- legacy Helm deploy 與 Argo CD 是否會同時控制同一批 workload。
- UAT / dev 的 ServiceAccount、GSA、IAM binding 與 secret remoteRef 是否分離。
- dry run 是否會誤寫 `k8s-deploy` `main` 或影響共享 UAT / dev 環境。

## 目前成功案例

已知 UAT 成功案例來自 `aile-service-account`：

- upstream `springcloud-aile!31` 加入 `aile_cloud/k8s-deploy` CI include、`update_k8s_deploy_repo` stage、UAT GitOps update job，並讓 `deploy-uat` 排除已交給 GitOps 的 service。
- downstream `k8s-deploy!197` 建立 `newaile/aile-service-account` desired state 與 bootstrap override。
- downstream `k8s-deploy!221` 更新 `aile-service-account` chart dependency，並擴展其他 `aile-service-*` UAT values 雛形。
- downstream `k8s-deploy!222` 移除誤加的 `aile-service-admin` commit，代表早期多服務展開曾經有回滾修正。
- `helm-chart!23` 到 `!26` 補齊 `flex-app` 對 existing ServiceAccount、extra containers、`global.envName`、ExternalSecret env、config templating、matchLabels、envFrom 等能力。

目前 live UAT 的 Workload Identity chain 可以連起來，但命名策略和 `ailebff` / `cardbff` 類型服務不完全一致：

```text
Deployment serviceAccountName: aile-service-account
KSA annotation: uat-aile-service-account@aile-main-uat.iam.gserviceaccount.com
GSA IAM member: serviceAccount:aile-main-uat.svc.id.goog[newaile/aile-service-account]
```

也就是目前是用 `newaile/aile-service-account` 這個 KSA annotation 到 `uat-aile-service-account@aile-main-uat.iam.gserviceaccount.com`。這能運作，但 env 分離不乾淨。

後續查 GitLab MR 歷史後，UAT 的推進方式不是一開始 9 個服務全部 batch，也不是嚴格每個 service 都永久拆一個 branch。實際是漸進式：

| Upstream MR | Branch | Scope | Pattern |
| --- | --- | --- | --- |
| `springcloud-aile!31` | `DEVOPS-100-add-k8s-deploy` | `aile-service-account` | single `.trigger-k8s-update`，只排除 account。 |
| `springcloud-aile!42` | `DEVOPS-106-add-k8s-deploy` | `aile-service-admin` | 開始引入 batch template，`TARGET_FOLDERS` 累加 account/admin，並加入 `HELM_DISABLED_SERVICES`。 |
| `springcloud-aile!49` | `DEVOPS-122-add-k8s-deploy` | `aile-service-application` | 繼續累加 service。 |
| `springcloud-aile!50` | `DEVOPS-127-add-k8s-deploy` | `aile-service-base` | 繼續累加 service。 |
| `springcloud-aile!51` | `DEVOPS-129-add-k8s-deploy` | `aile-service-integration` | 繼續累加 service。 |
| `springcloud-aile!52` | `DEVOPS-134-add-k8s-deploy` | `aile-service-job` | 繼續累加 service。 |
| `springcloud-aile!53` | `DEVOPS-140-add-k8s-deploy` | `aile-service-notice`、`aile-service-room`、`aile-service-tenant` | 一個 MR 加最後三個 service。 |

這代表 dev 可以採同樣策略：先用小 scope 驗證一個服務，確認 handoff 風險，再逐步累加到 batch。

## 待處理微服務

本次 migration 待處理的非 gateway 微服務：

| Service | GitOps path | UAT status | Dev status | Notes |
| --- | --- | --- | --- | --- |
| `aile-service-account` | `newaile/aile-service-account` | 已有成功案例，需要整理 ServiceAccount 分離 | 待補 | 現在 base values pin KSA name。 |
| `aile-service-admin` | `newaile/aile-service-admin` | 待驗證 | 待補 | 曾被誤加後移除，需重新以最新狀態驗證。 |
| `aile-service-application` | `newaile/aile-service-application` | 待驗證 | 待補 | 需確認 live manifest、secret remoteRef、KSA/GSA。 |
| `aile-service-base` | `newaile/aile-service-base` | 待驗證 | 待補 | 需確認 legacy Helm 與 Argo CD handoff。 |
| `aile-service-integration` | `newaile/aile-service-integration` | 待驗證 | 待補 | 需確認 runtime dependency 與 IAM role。 |
| `aile-service-job` | `newaile/aile-service-job` | 待驗證 | 待補 | 需確認 job/service semantics 是否只有 Deployment。 |
| `aile-service-notice` | `newaile/aile-service-notice` | 待驗證 | 待補 | 需特別確認 Firebase / push 相關 secret 與 IAM。 |
| `aile-service-room` | `newaile/aile-service-room` | 待驗證 | 待補 | 需確認 service port、probe、secret。 |
| `aile-service-tenant` | `newaile/aile-service-tenant` | 待驗證 | 待補 | 需確認 secret 與 live env。 |

不納入本次：

- `aile-service-gateway`

gateway 使用獨立 chart、獨立 CI deploy template，這次不應混入非 gateway GitOps migration。

## ServiceAccount 目標做法

目前 springcloud 的 pattern 是：

```text
values.uat.yaml:
  serviceAccount.create: true
  serviceAccount.annotations.iam.gke.io/gcp-service-account: uat-<service>@aile-main-uat.iam.gserviceaccount.com
```

實際 live UAT 與 `ailebff` / `webchatbff` 參考模式確認後，KSA name 不需要帶 env prefix。正確分離點是 GSA，而不是 KSA：

```text
KSA:
  newaile/<service>

GSA:
  dev-<service>@aile-main-development.iam.gserviceaccount.com
  uat-<service>@aile-main-uat.iam.gserviceaccount.com
```

`flex-app` 的 ServiceAccount name 規則是：

```text
serviceAccount.create=true 且 serviceAccount.name 有值:
  使用 serviceAccount.name

serviceAccount.create=true 且 serviceAccount.name 空或未設定:
  fallback 到 release/fullname，也就是目前 service name
```

因此 `values.yaml` 裡原本的：

```yaml
serviceAccount:
  create: true
  name: aile-service-account
```

可以從 base 移除。各環境 overlay 只需要放：

目標改成：

```text
values.yaml:
  不放 serviceAccount block，避免 base 綁死環境或誤導命名

values.dev.yaml:
  serviceAccount.create: true
  serviceAccount.annotations.iam.gke.io/gcp-service-account: dev-<service>@aile-main-development.iam.gserviceaccount.com

values.uat.yaml:
  serviceAccount.create: true
  serviceAccount.annotations.iam.gke.io/gcp-service-account: uat-<service>@aile-main-uat.iam.gserviceaccount.com
```

對應 IAM binding 應綁同一個 KSA name：

```text
serviceAccount:aile-main-development.svc.id.goog[newaile/<service>]
serviceAccount:aile-main-uat.svc.id.goog[newaile/<service>]
```

否則 Pod 可能拿到正確 GSA annotation，但 token exchange 會失敗，典型錯誤是 `iam.serviceAccounts.getAccessToken denied`。

## Secret 管理

repo 只管理 ExternalSecret reference，不管理 secret value。

目標命名：

```text
dev:
  config.envs.NACOS_PASSWORD.remoteRef: dev-<service>

uat:
  config.envs.NACOS_PASSWORD.remoteRef: uat-<service>
```

每個 service migration 前都要確認：

- GCP Secret Manager 中 env-specific secret 是否存在。
- ExternalSecret render 後的 K8s Secret name 是否符合 Deployment `envFrom.secretRef`。
- 不把 secret value 寫進 Git。
- 如果 service 有 Firebase、Pub/Sub、Redis、OTEL 或其他 runtime dependency，從程式碼與 live env 推導所需 IAM role，不用 generic checklist 代替。

## Upstream CI 目標做法

`springcloud-aile` 應維持 monorepo batch GitOps update：

- `pre-check` 產出 `CHANGED_SERVICES` dotenv artifact。
- `build-images` 只 build changed non-gateway services。
- GitOps update job 使用 `.trigger-k8s-update-batch`。
- `TARGET_FOLDERS` 包含 9 個非 gateway `newaile/aile-service-*` paths。
- batch job 只 trigger 一次 `k8s-deploy` pipeline，並只更新 `CHANGED_SERVICES` 命中的 target folders。
- `deploy-uat` 的 legacy Helm direct deploy 必須排除 GitOps managed services，避免 Helm 與 Argo CD 同時控制同一批 workload。
- gateway deploy jobs 不改。

UAT 目前已接近這個目標，下一步是把 dev 的入口和 desired state 補齊後，再讓 dev 也走同樣的 GitOps path。

## Dry Run 設計

這次討論後把 dry run 分成兩種，避免混淆：

| 類型 | 驗證內容 | 是否跑 `ci-deploy.sh` | 是否影響 Helm release | 用途 |
| --- | --- | --- | --- | --- |
| GitOps update dry run | upstream 能否 trigger `k8s-deploy`、downstream 是否更新正確 branch 的 `values.<env>.yaml` image tag | 否 | 否 | 驗證 CI/GitOps update path。 |
| live cutover rehearsal | legacy Helm 是否排除/disable 已遷移服務、Argo CD 是否接手、兩邊是否衝突 | 是，或等價地讓 legacy deploy 路徑生效 | 是 | 正式切換前演練，不是無副作用 dry run。 |

`ci-deploy.sh` 的核心動作是：

```bash
helm upgrade $RELEASE_NAME ${HELM_CHART_PATH} --install ...
```

所以只要 dry run 定義要求跑原本 `ci-deploy.sh` 路徑，就會寫 live Helm release；沒有無副作用 workaround。若要驗證 command/render 而不寫 live，必須另外做 `helm template` / `helm upgrade --dry-run --debug` 類的腳本支援。

單純使用 `.trigger-k8s-update` 或 `.trigger-k8s-update-batch` 不會跑 `springcloud-aile/scripts/ci-deploy.sh`。它只會 trigger `k8s-deploy` pipeline，執行 `.update-values` / `.update-values-v2-batch` 去 commit 更新 `k8s-deploy` branch。這條路的風險是誤寫 branch 或 Argo CD 正在追該 branch，不是 legacy Helm 全量部署。

monorepo dry run 不能直接用正式 `uat-*` 或 `dev-*` tag 去寫 `k8s-deploy main`。

目標設計：

- 使用 reusable `K8S_DEPLOY_REF`。
- upstream CI include ref 指到 `k8s-deploy` test branch。
- `.trigger-k8s-update-batch` trigger branch 使用 `K8S_DEPLOY_REF`。
- downstream `.update-values` 和 `.update-values-v2-batch` 的 repository raw read ref 使用同一個 `K8S_DEPLOY_REF`。
- downstream commit API 的 branch 也使用同一個 `K8S_DEPLOY_REF`。
- formal flow 預設 `K8S_DEPLOY_REF=main`。

`DEVOPS-147` 曾短暫評估 dev/account dry-run branch flow：

```text
k8s-deploy branch:
  DEVOPS-147/aile-service-account-dev-flex-app

springcloud-aile branch:
  feature/DEVOPS-147-aile-service-account-ci-update
```

評估後決定不保留這個不安全 dry run branch flow，因為若要完整驗證 handoff，必須納入 legacy `ci-deploy.sh` / Helm release 狀態；若只跑 GitOps update，則無法驗證 Helm handoff。`DEVOPS-147` 不再使用 feature branch include ref 或 `K8S_DEPLOY_REF` 指向 dry-run branch。

上游 `.gitlab-ci.yml` 保留跟 UAT 同型的正式 dev batch job，使用 `k8s-deploy` `main` include，先只放 `aile-service-account`：

```yaml
.trigger-k8s-update-dev-template:
  extends: .trigger-k8s-update-batch
  variables:
    DEPLOY_ENV: dev
    NEW_TAG: $CI_COMMIT_SHORT_SHA
  rules:
    - if: $CI_COMMIT_BRANCH == "release"

update-k8s-deploy-gitops-services-dev:
  extends: .trigger-k8s-update-dev-template
  variables:
    TARGET_FOLDERS: newaile/aile-service-account
```

`when: manual` 只能避免 push feature branch 就自動 trigger downstream GitOps update；它不是 Helm handoff 的保護。Helm handoff 的保護是 `DEPLOY_EXCLUDED_SERVICES` 與 `HELM_DISABLED_SERVICES`，只有在 service 已 ready for cutover 時才應加入。目前 dev 先針對 account 加入：

```yaml
deploy-dev:
  variables:
    DEPLOY_EXCLUDED_SERVICES: aile-service-account
    HELM_DISABLED_SERVICES: account
```

## Legacy Helm Handoff

`springcloud-aile` 的 legacy `aile-service` chart 是 multi-service chart，不是 Helm 本身強制如此，而是 chart 設計如此：

- `kubernetes/helm/aile-service/values.yaml` 有 `.Values.services` map。
- `templates/deployment.yaml`、`service.yaml`、`hpa.yaml`、`pdb.yaml` 都 `range .Values.services`。
- `scripts/ci-deploy.sh` 對同一個 `$RELEASE_NAME` 跑一次 `helm upgrade`，再用 `--set-string services.<service>.imageTag=<tag>` 更新 changed services。

因此 legacy deploy 看似增量更新 image tag，底層仍會 render 整個 Helm release。這也是 handoff 時需要明確處理已遷移 service 的原因。

兩個變數的意思：

```text
DEPLOY_EXCLUDED_SERVICES
  用完整 monorepo service name，例如 aile-service-account。
  在 .deploy_template 中把 service 從 CHANGED_SERVICES 濾掉，避免 direct Helm deploy 更新它的 image tag。

HELM_DISABLED_SERVICES
  用 Helm values.services key，例如 account。
  在 ci-deploy.sh 中追加 --set services.account.enabled=false，讓舊 Helm release 不再 render account。
```

白話：

```text
DEPLOY_EXCLUDED_SERVICES = 不更新它
HELM_DISABLED_SERVICES = 把舊 Helm 裡的它關掉
```

如果 service 還沒有準備好由 Argo CD 接手，兩個都不應先加。只加 `DEPLOY_EXCLUDED_SERVICES` 也會讓開發者原本的 legacy deploy 不再更新該 service image；只加 `HELM_DISABLED_SERVICES` 則更危險，會讓舊 Helm release 停止 render 該 service。

當 service ready for cutover 時，兩個應一起加。例如第一個 dev/account cutover guard：

```yaml
deploy-dev:
  variables:
    DEPLOY_EXCLUDED_SERVICES: aile-service-account
    HELM_DISABLED_SERVICES: account
```

之後每個 service ready 後再逐步累加：

```yaml
DEPLOY_EXCLUDED_SERVICES: aile-service-account,aile-service-admin
HELM_DISABLED_SERVICES: account,admin
```

全部 9 個都由 Argo CD 接手後，再評估收斂 batch、縮小或移除 legacy `deploy-dev` 的 non-gateway 責任。

刪 Helm release secret 不能取代 `HELM_DISABLED_SERVICES`：

```text
刪 Helm secret = 清掉 Helm release history / state record。
HELM_DISABLED_SERVICES = 改變未來 legacy Helm deploy 會 render 什麼。
```

如果 CI 之後仍會跑 `helm upgrade --install`，刪掉 release secret 不能防止 legacy Helm 再把 service 帶回來。

Dry run 成功條件：

- upstream pipeline 使用 feature branch CI config。
- build job 產生測試 image tag。
- batch job 只匹配 changed non-gateway services。
- downstream `k8s-deploy` pipeline 跑在 test branch。
- bot commit 只更新預期的 `newaile/<service>/values.<env>.yaml` image tag。
- `k8s-deploy main` 沒有出現 dry-run tag 或 pipeline URL。
- 共享 UAT / dev Argo CD Application 沒有被 test branch 影響，除非已明確建立 sandbox Application。

## Migration 步驟

1. Scope discovery
   - 確認目標 env、service list、namespace、release name、current controller。
   - 確認 `springcloud-aile`、`k8s-deploy` 在非 shared feature branch。

2. Desired state cleanup
   - 對 9 個 service 檢查 `values.yaml`、`values.uat.yaml`、`Chart.yaml`。
   - 移除或下放 base `values.yaml` 中 env-specific ServiceAccount name。
   - 補 `values.dev.yaml`，並使用 dev GSA / secret remoteRef。
   - 保留 image repository、probe、service port、resources、OTEL sidecar 等 service common 設定。

3. Bootstrap readiness
   - 確認 `newaile-proj` discovery 會產生每個 target service 的 child Application。
   - 確認每個 env 每個 service 只有一個 enabled `values.<env>.yaml`。
   - 不建立 gateway Application。

4. CI handoff readiness
   - 更新 upstream batch target folders 和 env rules。
   - 更新 downstream dry-run branch controls。
   - 確認 legacy direct Helm deploy 不會部署 GitOps services。

5. Render readiness
   - 對每個 service 跑 dependency build / render。
   - 比對 Deployment、Service、ConfigMap、ExternalSecret、ServiceAccount、HPA、PDB。
   - 對高風險差異逐項記錄，不用完整 manifest dump 取代分析。

6. Live verification
   - 先確認 kube context 與 gcloud project。
   - Argo CD UI 確認 Application source path、target revision、value files、sync、health。
   - Kubernetes read-only 確認 live Deployment image、KSA、GSA annotation、envFrom、Service、HPA/PDB、pod readiness。
   - GCP read-only 確認 IAM binding、Secret Manager remoteRef、必要 runtime roles。

## 驗證清單

Repo and branch:

```bash
git branch --show-current
git status --short --untracked-files=all
git diff --name-status HEAD
git diff --cached --name-status
```

Helm render:

```bash
helm dependency build newaile/<service>
helm template <service> newaile/<service> -n newaile \
  -f newaile/<service>/values.yaml \
  -f newaile/<service>/values.<env>.yaml
```

Bootstrap render:

```bash
helm template bootstrap bootstrap -n argocd -f bootstrap/values.<env>.yaml
```

Live context:

```bash
kubectl config current-context
gcloud config get-value project
```

Workload Identity:

```bash
kubectl -n newaile get deploy <service> \
  -o jsonpath='{.spec.template.spec.serviceAccountName}{"\n"}'

kubectl -n newaile get sa <ksa> \
  -o jsonpath='{.metadata.annotations.iam\.gke\.io/gcp-service-account}{"\n"}'

gcloud iam service-accounts get-iam-policy <gsa-email> \
  --project=<project>
```

## 主要風險

- `values.yaml` 保留 KSA name 會讓 dev / uat / prod 共用同一套 KSA naming semantics。
- 改 KSA name 後如果 IAM binding 沒跟著改，Pod 會發生 token exchange 失敗。
- official `uat-*` tag 如果 dry run branch 沒隔離，可能直接寫 `k8s-deploy main`。
- legacy Helm direct deploy 和 Argo CD 同時管理同一 service，會產生 controller race。
- bootstrap 如果同時 discover old path 和 new path，可能產生 duplicate Application 或 prune 風險。
- secret remoteRef 名稱正確不代表 secret 存在，也不代表 runtime IAM role 足夠。
- `aile-service-notice` 需要特別確認 Firebase / push notification 相關設定與權限。

## 下一步

1. 在 `springcloud-aile` 和 `k8s-deploy` 建立或切換到 feature branch。
2. 先處理 `k8s-deploy` dry-run branch controls，避免後續測試誤寫 `main`。
3. 對 9 個 service 做 values cleanup 與 dev overlay 補齊。
4. 逐 service render，先以 `aile-service-account` 作為 golden pattern。
5. 對每個 service 決定要做 GitOps update dry run，還是 live cutover rehearsal；不要把兩者混在同一個風險敘述。
6. 若只是 GitOps update dry run，保證只改 `k8s-deploy` feature branch，且 Argo CD 不追該 branch。
7. 若要 live cutover rehearsal，先確認 GSA/IAM/Secret/ExternalSecret/render/Argo CD Application 都 ready，再把該 service 加入 `DEPLOY_EXCLUDED_SERVICES` 與 `HELM_DISABLED_SERVICES`。
8. 全部 9 個 service 驗證完成後，再把 dev target folders 收斂為完整 batch。
