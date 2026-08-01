# Authserver UAT GitOps Migration 變更報告

## 上游 CI 變更

修改 repo：

```text
/home/samlu/workspace-repos/authserver
```

修改檔案：

```text
.gitlab-ci.yml
```

要做的變更：

- 加入 `aile_cloud/k8s-deploy` 的 GitOps trigger include。
- 移除 UAT 原本直接執行 Helm deploy 的 `deploy-uat` job。
- 新增 `update-k8s-deploy-uat` job。
- 保留既有 UAT image build/push job `publish-uat`。
- 使用 `publish-uat` 產出的 `IMAGE_TAG` 更新 `k8s-deploy`。
- GitOps 更新目標資料夾是 `newaile/authserver`。

CI stage/job 命名說明：

- `build` stage 目前只跑 `./gradlew clean build -x test`，是 Spring Boot application build，不會 build/push image，也不會產出部署用的 `IMAGE_TAG`。
- `publish` stage 裡的 `publish-uat` 才會跑 `./gradlew jib`，負責 build/push container image，並產出 `IMAGE_TAG` 給 `update-k8s-deploy-uat` 使用。
- 這個命名跟已遷移服務不完全一致；例如 `aile-service-*` 在 `springcloud-aile` 裡是 `build-images` 負責 image build/push。可以討論 authserver 是否要沿用現有 `publish-*` 命名，或改成更接近既有 GitOps migration pattern 的命名。

目標 CI 形狀：

```yaml
include:
  - project: "aile_cloud/k8s-deploy"
    ref: main
    file: ".gitlab/ci/trigger-k8s-update.gitlab-ci.yml"

stages:
  - build
  - test
  - publish
  - deploy-dev
  - deploy-qa
  - update_k8s_deploy_repo
  - deploy-prod

update-k8s-deploy-uat:
  extends: .trigger-k8s-update
  needs:
    - job: publish-uat
      artifacts: true
  variables:
    DEPLOY_ENV: uat
    NEW_TAG: $IMAGE_TAG
    TARGET_FOLDER: newaile/authserver
  rules:
    - if: "$CI_COMMIT_TAG =~ /^uat-.*$/"
```

## 下游 CD 變更

修改 repo：

```text
/home/samlu/workspace-repos/k8s-deploy
```

新增或修改檔案：

```text
newaile/authserver/Chart.yaml
newaile/authserver/values.yaml
newaile/authserver/values.uat.yaml
bootstrap/values.uat.yaml
```

## Chart 設定

新增 `newaile/authserver/Chart.yaml`，使用 `flex-app` `3.1.0`。

## Argo CD Application 設定

在 `bootstrap/values.uat.yaml` 加入 authserver 的 UAT Application 設定：

```text
Application name: authserver
Path: newaile/authserver
Release name: authserver-uat
Destination namespace: newaile
Value files:
  - values.yaml
  - values.uat.yaml
```

## values.yaml 設定

`newaile/authserver/values.yaml` 放跨環境共用的 workload 設定：

```yaml
nameOverride: auth-server
fullnameOverride: auth-server
deployment:
  replicas: 2
  image:
    repository: asia-docker.pkg.dev/aile-infra/aile-services/auth-server
    tag: x.y.z
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
      ephemeral-storage: 1Gi
    limits:
      memory: 1Gi
      ephemeral-storage: 1Gi
services:
  main:
    enabled: true
    type: ClusterIP
    ports:
      - name: http
        port: 80
        targetPort: 8080
autoscaling:
  enabled: false
pdb:
  enabled: false
serviceAccount:
  create: true
  name: authserver
```

## values.uat.yaml 設定

`newaile/authserver/values.uat.yaml` 放 UAT 環境設定：

```yaml
global:
  envName: uat

deployment:
  image:
    tag: uat-v5.0.0-202604031128

serviceAccount:
  annotations:
    iam.gke.io/gcp-service-account: uat-authserver@aile-main-uat.iam.gserviceaccount.com
```

UAT non-secret env：

```yaml
APP_ENV: "{{ .Values.global.envName }}"
SPRING_PROFILES_ACTIVE: "{{ .Values.global.envName }}"
SPRING_CONFIG_IMPORT: "optional:file:/app/config/secret.yaml"
JWT_ALLOW_EPHEMERAL_KEYS: "false"
JWT_PRIVATE_KEY_PATH: /var/run/auth/jwt/private-key.pem
JWT_PUBLIC_KEY_PATH: /var/run/auth/jwt/public-key.pem
NACOS_SP: authserver
NACOS_CONFIG_SERVER_ADDR: nacos-internal.newaile.svc.cluster.local
NACOS_USER: nacos
NACOS_CONFIG_GROUP: DEFAULT_GROUP
NACOS_CONFIG_DATA_ID: as-common.yaml
DB_HOST: "172.18.48.19"
DB_PORT: "3306"
DB_NAME: authserver
DB_USERNAME: authserver
DB_USE_SSL: "true"
DB_ALLOW_PUBLIC_KEY_RETRIEVAL: "false"
REDIS_HOST: "172.18.49.163"
REDIS_PORT: "6379"
REDIS_PASSWORD: ""
MIGRATION_ENABLED: "false"
OTP_PROVIDER_TYPE: http
OTP_EXPOSE_CODE_IN_RESPONSE: "false"
```

UAT secret file 掛載：

```yaml
config:
  secretFiles:
    secret.yaml:
      mountPath: /app/config/secret.yaml
      remoteRef: uat-authserver
    private-key.pem:
      mountPath: /var/run/auth/jwt/private-key.pem
      remoteRef: uat-authserver-jwt-private-key
```

UAT config file 掛載：

```yaml
config:
  configFiles:
    public-key.pem:
      mountPath: /var/run/auth/jwt/public-key.pem
      content: |
        -----BEGIN PUBLIC KEY-----
        <JWT_PUBLIC_KEY_PEM>
        -----END PUBLIC KEY-----
```

## GCP 設定

建立 authserver 自己的 GSA：

```text
uat-authserver@aile-main-uat.iam.gserviceaccount.com
```

設定 Workload Identity 綁定：

```text
KSA: newaile/authserver
GSA: uat-authserver@aile-main-uat.iam.gserviceaccount.com
Member: serviceAccount:aile-main-uat.svc.id.goog[newaile/authserver]
Role: roles/iam.workloadIdentityUser
```

建立 GCP Secret Manager secrets：

```text
uat-authserver
uat-authserver-jwt-private-key
```

`uat-authserver` 放 Spring Boot config secret：

```yaml
NACOS_PASSWORD: "<UAT_NACOS_PASSWORD>"
DB_PASSWORD: "<UAT_DB_PASSWORD>"
```

`uat-authserver-jwt-private-key` 放 JWT private key：

```text
<JWT_PRIVATE_KEY_PEM>
```

JWT public key 放在 GitOps values，產生 ConfigMap：

```text
public-key.pem: <JWT_PUBLIC_KEY_PEM>
```

## Argo CD 管理的資源

Migration 後 Argo CD 會管理：

```text
ServiceAccount/authserver
ConfigMap/auth-server-env
ConfigMap/auth-server-files
ExternalSecret/auth-server-files
Service/auth-server
Deployment/auth-server
```
