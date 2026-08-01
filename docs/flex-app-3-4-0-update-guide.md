# flex-app 3.4.0 更新說明

`flex-app` 3.4.0 的重點是把各環境檔裡重複出現、規則相同的設定，拉回服務 base `values.yaml` 管理。

以前很多服務會在 `values.dev.yaml`、`values.qa.yaml`、`values.uat.yaml`、`values.prod.yaml` 重複寫相同結構，只差環境名、image tag、Nacos endpoint 或 GCP project。3.4.0 的方向是：環境檔只保留真正跟環境有差異的值，例如 `deployment.image.tag`、少數環境特例的 `nacos.serverAddr`；其餘可用固定規則表達的內容，改放在服務 base `values.yaml`。

這不代表所有命名規則都要藏進 chart helper。只要是 reviewer 需要直接看懂的 runtime wiring，例如 Secret Manager `remoteRef`、ServiceAccount name、GSA annotation，就在 base `values.yaml` 用 template 表達式寫出規則。`flex-app` 負責 render、預設值、schema validation 和 fail fast。

## 核心概念

### 顯式 wiring

顯式 wiring 指的是：雖然值可以從環境名、release name、GCP project 推導，但它會影響權限、secret 來源或 runtime 行為，所以直接寫在服務 `values.yaml`。

例如：

```yaml
serviceAccount:
  name: "{{ .Release.Name }}"
  annotations:
    iam.gke.io/gcp-service-account: "{{ .Values.global.envName }}-{{ .Release.Name }}@{{ .Values.global.gcpProjectId }}.iam.gserviceaccount.com"

nacos:
  password:
    remoteRef: "{{ .Values.global.envName }}-{{ .Release.Name }}"

config:
  secretFiles:
    application-secret.yaml:
      mountPath: /config/application-secret.yaml
      remoteRef: "{{ .Values.global.envName }}-aile-nacos-application"
```

這樣 reviewer 不需要打開 chart helper，也能看出：

- Pod 用哪個 KSA。
- KSA 對應哪個 GSA。
- `NACOS_PASSWORD` 來自哪個 Secret Manager secret。
- 哪些 secret file 會被掛進容器，以及掛在哪個路徑。

### tpl-enabled values

`{{ ... }}` 是 Helm 的 Go template expression。當這種 expression 放在 `values.yaml` 裡，chart 必須用 Helm 的 `tpl` 函式再解析一次。

這種欄位可以稱為 **tpl-enabled value**，也可以說是 **templated value**。

例如服務 values 寫：

```yaml
nacos:
  password:
    remoteRef: "{{ .Values.global.envName }}-{{ .Release.Name }}"
```

chart template 內用：

```gotemplate
tpl .Values.nacos.password.remoteRef .
```

render 後才會變成：

```text
dev-aile-service-application
```

目前 3.4.0 重要的 tpl-enabled values 包含：

- `nameOverride`
- `fullnameOverride`
- `deployment.image.repository`
- `runtimeEnv.envName`
- `nacos.password.remoteRef`
- `serviceAccount.name`
- `serviceAccount.annotations`
- `config.envs.*.remoteRef`
- `config.secretFiles.*.remoteRef`

### global values

`global` 是 bootstrap / app-of-apps 注入給子 chart 的環境資訊。

服務 `values.yaml` 通常不需要自己填：

```yaml
global:
  envName: dev
  gcpProjectId: aile-main-development
```

正式部署時由 Argo CD Application parameters 注入。local render 才用 `--set` 模擬。

常用欄位：

```yaml
global:
  envName: qa
  gcpProjectId: aile-main-qa
```

`global.envName` 常用來組：

- runtime env，例如 `APP_ENV`
- selector label，例如 `environment`
- Secret Manager remoteRef

`global.gcpProjectId` 常用來組：

- GSA email
- Pub/Sub autoscaling query

## 推薦 values 形狀

以 `aile-service-application` 為例：

```yaml
common: &common
  nameOverride: "{{ .Release.Name }}"
  fullnameOverride: "{{ .Release.Name }}"

  config:
    envs:
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318"
      OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf"
    secretFiles:
      application-secret.yaml:
        mountPath: /config/application-secret.yaml
        remoteRef: "{{ .Values.global.envName }}-aile-nacos-application"

  deployment:
    enabled: true
    image:
      repository: asia-docker.pkg.dev/aile-infra/aile-services/aile-service-application

  serviceAccount:
    create: true
    name: "{{ .Release.Name }}"
    annotations:
      iam.gke.io/gcp-service-account: "{{ .Values.global.envName }}-{{ .Release.Name }}@{{ .Values.global.gcpProjectId }}.iam.gserviceaccount.com"

  nacos:
    enabled: true
    namespace: newaile
    serverAddr: nacos-internal.newaile.svc.cluster.local
    password:
      enabled: true
      remoteRef: "{{ .Values.global.envName }}-{{ .Release.Name }}"

stable:
  <<: *common
```

環境檔只保留真的依環境改變的值：

```yaml
stable:
  deployment:
    image:
      tag: qa-v5.0.0-202606121817
```

如果某個環境的 Nacos DNS 不同，才在該環境覆寫：

```yaml
stable:
  nacos:
    serverAddr: nacos-internal.default.svc.cluster.local
  deployment:
    image:
      tag: qa-v5.0.0-202606121817
```

## values 區塊說明

### nameOverride / fullnameOverride

用途：控制 chart name 和 Kubernetes resource fullname。

newaile 服務通常讓它們跟 Helm release name 一致：

```yaml
nameOverride: "{{ .Release.Name }}"
fullnameOverride: "{{ .Release.Name }}"
```

這兩個欄位支援 `tpl`。

`fullnameOverride` 會影響多數 resource name，例如 Deployment、Service、ServiceAccount、ExternalSecret name 等。

### config.envs

用途：宣告應用程式需要的 env。

一般非敏感 env 寫 scalar value：

```yaml
config:
  envs:
    OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318"
    OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf"
```

敏感 env 用 `remoteRef`，由 ExternalSecret 從 Secret Manager 取值：

```yaml
config:
  envs:
    API_TOKEN:
      remoteRef: "{{ .Values.global.envName }}-my-service-api-token"
```

不要在 `config.envs` 寫 `runtimeEnv` / `nacos` 管理的 key：

```text
APP_ENV
SPRING_PROFILES_ACTIVE
NACOS_SP
NACOS_DISCOVERY_SERVER_ADDR
NACOS_CONFIG_SERVER_ADDR
NACOS_USER
NACOS_PASSWORD
NACOS_CONFIG_GROUP
NACOS_CONFIG_DATA_ID
```

這些 key 如果出現在 `config.envs`，chart 會 fail fast，避免同一個 env 有兩個來源。

### config.configFiles

用途：把非敏感設定檔掛進容器。

例子：

```yaml
config:
  configFiles:
    application.yaml:
      mountPath: /config/application.yaml
      content:
        spring:
          application:
            name:
              _default: aile-service-application
```

`content` 會被 render 成 ConfigMap data。

### config.secretFiles

用途：把 Secret Manager 的內容透過 ExternalSecret 同步後，以檔案方式掛進容器。

這是 secret file 的唯一入口。不要把 secret file 掛載藏在 `nacos` 底下。

新命名方向：

```text
/config/<service>.yaml
/config/<service>-secret.yaml
/config/common.yaml
/config/common-secret.yaml
```

服務專屬 secret file：

```yaml
config:
  secretFiles:
    application-secret.yaml:
      mountPath: /config/application-secret.yaml
      remoteRef: "{{ .Values.global.envName }}-aile-nacos-application"
```

common secret file：

```yaml
config:
  secretFiles:
    common-secret.yaml:
      mountPath: /config/common-secret.yaml
      remoteRef: "{{ .Values.global.envName }}-aile-nacos-common"
```

`application-secret.yaml` 和 `common-secret.yaml` 是不同 key、不同 mountPath，所以不會互相覆蓋。

如果開發端還只讀 `/config/secret.yaml`，但 values 已改成 `/config/application-secret.yaml`，應用程式會讀不到新檔案。Secret Manager 仍然抓得到，問題會發生在應用程式讀檔路徑。

### deployment

用途：控制 Deployment 本體。

必要 image 寫法：

```yaml
deployment:
  enabled: true
  image:
    repository: asia-docker.pkg.dev/aile-infra/aile-services/aile-service-application
```

`repository` 留在服務 `values.yaml`，因為這是服務自己的 image 來源。`tag` 通常放在 `values.<env>.yaml`：

```yaml
stable:
  deployment:
    image:
      tag: qa-v5.0.0-202606121817
```

`pullPolicy` 預設是 `IfNotPresent`，一般服務不用寫。

常見資源設定：

```yaml
deployment:
  resources:
    requests:
      cpu: "2"
      memory: 2Gi
    limits:
      memory: 4Gi
```

`deployment.labels` 空值時，chart 會產生：

```yaml
app: <fullname>
```

`deployment.matchLabels` 空值時，chart 會產生：

```yaml
app: <fullname>
environment: <global.envName>
```

selector 是 Kubernetes immutable 欄位，因此 `matchLabels` 的結果要穩定。

### runtimeEnv

用途：統一產生 Spring runtime profile env。

預設開啟：

```yaml
runtimeEnv:
  enabled: true
  envName: "{{ .Values.global.envName }}"
  appEnvKey: APP_ENV
  springProfilesKey: SPRING_PROFILES_ACTIVE
```

會產生：

```text
APP_ENV=<global.envName>
SPRING_PROFILES_ACTIVE=<global.envName>
```

服務通常不用覆寫。

### nacos

用途：產生 Nacos runtime env。

```yaml
nacos:
  enabled: true
  namespace: newaile
  serverAddr: nacos-internal.newaile.svc.cluster.local
  password:
    enabled: true
    remoteRef: "{{ .Values.global.envName }}-{{ .Release.Name }}"
```

會產生：

```text
NACOS_SP
NACOS_DISCOVERY_SERVER_ADDR
NACOS_CONFIG_SERVER_ADDR
NACOS_USER
NACOS_PASSWORD
```

`nacos.namespace` 是 Nacos namespace / tenant，render 成 `NACOS_SP`。它不是 Kubernetes namespace。

`serverAddr` 是 discovery/config 共用位址。如果 discovery 和 config 要拆開，可以改用：

```yaml
nacos:
  discoveryServerAddr: nacos-discovery.newaile.svc.cluster.local
  configServerAddr: nacos-config.newaile.svc.cluster.local
```

`nacos.password.remoteRef` 必填，且支援 `tpl`。chart 不再自動組 `<env>-<fullname>`，因為 password 來源應該在服務 values 裡看得到。

### serviceAccount

用途：控制 Pod 使用的 Kubernetes ServiceAccount，以及 Workload Identity 的 GSA annotation。

推薦寫法：

```yaml
serviceAccount:
  create: true
  name: "{{ .Release.Name }}"
  annotations:
    iam.gke.io/gcp-service-account: "{{ .Values.global.envName }}-{{ .Release.Name }}@{{ .Values.global.gcpProjectId }}.iam.gserviceaccount.com"
```

`serviceAccount.name` 和 `serviceAccount.annotations` 都支援 `tpl`。

`flex-app` 不提供 `serviceAccount.workloadIdentity`。原因是 KSA/GSA 對應是重要權限 wiring，應該在服務 values 裡直接看得到。

### reloader

用途：ConfigMap / Secret 變更時，自動觸發 Pod restart。

預設開啟：

```yaml
reloader:
  enabled: true
  annotation: reloader.stakater.com/auto
  value: "true"
```

服務不要直接寫：

```yaml
deployment:
  annotations:
    reloader.stakater.com/auto: "true"
```

原因是 3.4.0 已經把 reloader 變成 chart 內建功能。若服務又自己寫 annotation，同一個功能會有兩個來源，之後要關閉或調整時很難判斷誰生效。

如果某個服務真的要關閉：

```yaml
reloader:
  enabled: false
```

### autoscaling

用途：產生 KEDA ScaledObject。

預設啟用 CPU profile：

```yaml
autoscaling:
  enabled: true
  minReplicaCount: 2
  maxReplicaCount: 5
  profiles:
    cpu:
      enabled: true
      metricType: Utilization
      targetUtilizationPercentage: 80
```

memory profile：

```yaml
autoscaling:
  profiles:
    memory:
      enabled: true
      metricType: Utilization
      targetUtilizationPercentage: 80
```

Pub/Sub profile：

```yaml
autoscaling:
  profiles:
    pubsub:
      enabled: true
      subscriptions:
        - name: aile-message-sub
          threshold: 10
          activationThreshold: 0
```

Pub/Sub profile 需要 `global.gcpProjectId`，因為 query 會用到 GCP project。

### pdb

用途：產生 PodDisruptionBudget。

預設：

```yaml
pdb:
  enabled: true
  minAvailable: 1
```

若服務要改用 `maxUnavailable`，就不要同時設定 `minAvailable`。

### services

用途：產生 Kubernetes Service。

`main` service 預設使用 chart fullname；其他 service 會加上 `-<name>`。

例子：

```yaml
services:
  main:
    enabled: true
    type: ClusterIP
    ports:
      - name: http
        port: 8009
        targetPort: 8009
        protocol: TCP
  metrics:
    enabled: false
```

`ports[].port` 是 Service port。`ports[].targetPort` 是 Pod container port 或 port name。

## schema validation 目前會擋什麼

`values.schema.json` 目前會先擋這些問題：

- `deployment.enabled=true` 時，`deployment.image.repository` 和 `deployment.image.tag` 必填且非空。
- `deployment.image.tag` 不能是 placeholder `x.y.z`。
- `deployment.image.pullPolicy` 只能是 `Always`、`IfNotPresent`、`Never`。
- `deployment.annotations` 不可以直接放 `reloader.stakater.com/auto`。
- `deployment.terminationGracePeriodSeconds` 必須是 `integer` 或 `null`，且不能小於 0。
- `config.envs` 的 value 只能是 scalar，或 `{ remoteRef: ... }` object。
- `config.envs.*.remoteRef` 必填且非空。
- `config.envs` 不可以放由 `runtimeEnv` / `nacos` 管理的 key。
- `config.secretFiles.*.mountPath` 必填且非空。
- `config.secretFiles.*.remoteRef` 必填且非空。
- `runtimeEnv.envName`、`runtimeEnv.appEnvKey`、`runtimeEnv.springProfilesKey` 如果有填，必須是非空字串。
- `nacos.enabled=true` 時，`serverAddr`、`discoveryServerAddr`、`configServerAddr` 至少要有一個。
- `nacos.password.enabled=true` 時，`nacos.password.remoteRef` 必填且非空。
- `reloader.annotation` 和 `reloader.value` 如果有填，必須是非空字串。
- `autoscaling.minReplicaCount` 不能小於 0。
- `autoscaling.maxReplicaCount` 不能小於 1。
- `autoscaling.pollingInterval` 不能小於 1。
- `autoscaling.cooldownPeriod` 不能小於 0。
- `autoscaling.profiles.pubsub.enabled=true` 時，`global.gcpProjectId` 必填且非空。
- `autoscaling.profiles.pubsub.enabled=true` 時，`subscriptions[].name` 必填且非空。
- `services.*.ports[]` 必須有 `port` 和 `targetPort`。
- `services.*.ports[].name` 如果有填，必須非空。
- `services.*.ports[].port` 必須是 1 到 65535 的整數。
- `services.*.ports[].protocol` 只能是 `TCP`、`UDP`、`SCTP`。
- `global.envName` 如果有填，必須是非空字串。

template 另外會 fail fast 擋掉 3.4.0 branch 中途討論過但未採用的草案欄位：

```text
nacos.secretFile
serviceAccount.workloadIdentity
```

這不是舊版相容問題，因為 3.4.0 還沒發布。它的目的只是避免未採用的草案欄位被 Helm 接受後變成 silent no-op。
