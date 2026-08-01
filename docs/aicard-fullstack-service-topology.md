# Aicard 全端服務拓撲

## 範圍

本文件整理 Aicard frontend、BFF、SpringCloud backend service calls 在本機 source repo 與 GitOps desired state 中的證據。這裡描述的是 repo/desired-state 顯示的預期接線，不代表 live cluster 現況。

已檢查路徑：

- `/home/samlu/devops-repos/aicard_app`
- `/home/samlu/devops-repos/cardbff`
- `/home/samlu/devops-repos/k8s-deploy/newaile/cardbff`
- `/home/samlu/devops-repos/springcloud-aile`

重要 repo 區分：

- `aicard_app` 是本文件檢查的 frontend repo。
- `aicardapp` 是另一個不同 repo，不在本文件範圍。

## 整體流向

```text
user / LIFF / browser
  -> aicard_app on Firebase Hosting
    -> cardbff GraphQL endpoint
      -> SpringCloud Aile backend through AILE_BASE_URL
        -> aile-service-account
        -> aile-service-application
        -> aile-service-base
    -> direct Aile attachment/OCR endpoints through VITE_AILE_ATTACHMENT_BASE_URL
      -> aile-service-base
      -> aile-service-application

cardbff
  -> external UUPON/dev.uupon.com point/goods/activity APIs
```

## 部署切分

| Layer | Repo/path | Deploy target | Evidence |
| --- | --- | --- | --- |
| Frontend | `aicard_app` | Firebase Hosting | `.firebaserc`, `firebase.json`, `.gitlab-ci.yaml`, Firebase deploy docs |
| BFF | `cardbff` | Docker image + Kubernetes GitOps | `origin/release` 的 `.gitlab-ci.yaml`，image `asia-docker.pkg.dev/aile-infra/aile-services/aicardbff`，`TARGET_FOLDER=newaile/cardbff` |
| BFF desired state | `k8s-deploy/newaile/cardbff` | Helm/flex-app desired state | `values.yaml`, `values.dev.yaml`, `values.qa.yaml`, `values.uat.yaml` |
| Backend APIs | `springcloud-aile` | SpringCloud microservices | `aile-service-account`, `aile-service-application`, `aile-service-base` |

## Frontend: `aicard_app`

`aicard_app` 是 Vite/React frontend。大多數 card/auth/user flows 走 GraphQL，也有直接 REST calls 給 Aile attachment/OCR flows。

主要 frontend environment keys：

| Env key | Purpose |
| --- | --- |
| `VITE_BFF_GRAPHQL` | `cardbff` GraphQL endpoint；被 `src/services/graphql/client.ts` 與多個 axios callers 使用。 |
| `VITE_AILE_ATTACHMENT_BASE_URL` | `src/services/aile/constants.ts` 中 direct Aile REST calls 的 base URL。 |
| `VITE_LIFF_ID`, `VITE_FALLBACK_LIFF_ID`, `VITE_LIFF_ENV` | LIFF/browser auth 與 routing behavior。 |
| `VITE_APP_BASE_URL`, `VITE_QR_CODE_BASE_URL` | Share/QR/redirect URL generation。 |
| `VITE_DEVICE_HEADER_NAME`, `VITE_SATOKEN_HEADER_NAME` | BFF/backend auth context 使用的 header names。 |

主要 frontend call groups：

| Frontend code area | Goes to | Notes |
| --- | --- | --- |
| `src/services/graphql/client.ts` | `ENV_CONFIG.BFF_GRAPHQL` | Shared GraphQL axios client。 |
| `src/services/graphql/mutations/*` | `cardbff /graphql` | Card/user/auth/notification mutations。 |
| `src/services/graphql/queries/*` | `cardbff /graphql` | Card list/detail/search/status/profile queries。 |
| `src/features/cardholder/services/*` | `cardbff /graphql` | 多個 services 直接用 axios 呼叫 GraphQL。 |
| `src/services/auth/loginWithScopeId.ts` | `cardbff /graphql` | 使用 scope ID 登入。 |
| `src/services/aile/constants.ts` | `VITE_AILE_ATTACHMENT_BASE_URL` | Avatar/upload/OCR/image flows 的 direct REST endpoints。 |

Frontend direct Aile REST endpoints：

| Frontend constant | Backend path |
| --- | --- |
| `AVATAR_UPLOAD_URL` | `/base/attachment/v2/avatar/upload` |
| `AVATAR_VIEW_URL_BASE` | `/base/attachment/v1/download/view/url` |
| `OCR_IMAGE_UPLOAD_URL` | `/base/attachment/v1/image/upload` |
| `OCR_ANALYZE_URL` | `/application/gemini/v1/analyze` |
| `AVATAR_BASE64_URL` | `/base/attachment/v1/avatar/download` |

## BFF: `cardbff`

本機 `cardbff` working branch 是 `main`，但 release 證據來自 `origin/release`。本文件讀取 `origin/release`，沒有 checkout。

`cardbff` 是 Apollo GraphQL BFF。它建立 auth、card、manualcard、notice、point、quest、relation、common 等 GraphQL modules 與 frontend-facing schemas。DataSources extend `BaseDataSource`，`BaseDataSource` 從 `AILE_BASE_URL` 設定 `baseURL`。

主要 BFF environment/config：

| Env/config | Purpose |
| --- | --- |
| `AILE_BASE_URL` | SpringCloud Aile backend calls 的 base URL。 |
| `AILE_AES_KEY`, `AILE_HMAC_KEY`, `AILE_ALGORITHM` | BFF request/auth/signing behavior。沒有讀取 values。 |
| `CARD_REDIRECT_URL` | GraphQL server 印出/使用的 card redirect URL。 |
| `PORT` | BFF listen port；desired state exposes service port `4000`。 |

### BFF GraphQL Modules To DataSources

| GraphQL module | DataSource(s) | Main backend service/path family |
| --- | --- | --- |
| `auth` | `AuthDataSource`，login/invite flows 也用 `QuestDataSource`、`UserDataSource` | `/account/*`, `/account/otp/*`, `/account/scope/*`, `/application/user/*`, quest paths |
| `card` | `CardDataSource`, `RelationDataSource`, `NotificationDataSource`, `UserDataSource` | `/application/card/*`, `/application/relation/*`, `/application/notification/*`, `/application/user/*` |
| `manualcard` | `ManualCardDataSource` | `/application/manualcard/*`, `/application/relation/*` |
| `notice` | `NotificationDataSource` | `/application/notification/*` |
| `relation` | `RelationDataSource` | `/application/relation/*` |
| `point` | `PointDataSource` | External `https://dev.uupon.com/*` APIs |
| `quest` | `QuestDataSource` | BFF implementation 裡的 quest/invite backend paths |
| `common` | Upload/scalar/common GraphQL helpers | Shared GraphQL scalar/types |

### BFF To SpringCloud Path Map

| BFF DataSource | Path families | SpringCloud owner inferred from path |
| --- | --- | --- |
| `AuthDataSource` | `/account/otp/v1/send`, `/account/otp/v1/validate`, `/account/v1/login`, `/account/v1/logout`, `/account/v1/mobile/set`, `/account/scope/v1/*` | `aile-service-account` |
| `AuthDataSource` | `/application/user/v1/mail/validate`, `/application/user/v1/exists/{scopeId}` | `aile-service-application` |
| `CardDataSource` | `/application/card/v1/*` | `aile-service-application` |
| `CardDataSource` / `RelationDataSource` | `/application/relation/v1/*` | `aile-service-application` |
| `ManualCardDataSource` | `/application/manualcard/v1/*` | `aile-service-application` |
| `NotificationDataSource` | `/application/notification/v1/*` | `aile-service-application` |
| `UserDataSource` | `/application/user/v1/*` | `aile-service-application` |
| Frontend direct REST | `/base/attachment/v1/*`, `/base/attachment/v2/*` | `aile-service-base` |
| Frontend direct REST | `/application/gemini/v1/analyze` | `aile-service-application` |
| `PointDataSource` | `https://dev.uupon.com/admin/v2/user/point/detail`, `/admin/v1/user/refresh/points`, `/goods/v1/tenant/goods/list`, `/activity/v1/user/activity/trigger` | External UUPON/dev.uupon.com |

## BFF Kubernetes Desired State

`k8s-deploy/newaile/cardbff` 把 `cardbff` 定義成 `aicardbff` workload：

- Chart name：`cardbff`。
- Image repository：`asia-docker.pkg.dev/aile-infra/aile-services/aicardbff`。
- Service port：`4000`。
- NEG annotation exposes port `4000`。
- Secret remoteRefs：
  - dev：`dev-aicardbff`
  - qa：`qa-aicardbff`
  - uat：`uat-aicardbff`
- Current desired image tags：
  - dev：`4ad81f34`
  - qa：`qa-1.1.2_20260506`
  - uat：`uat-v1.1.8-202606041444`

`origin/release` 上的 `cardbff` CI 會 build/push Docker image，然後觸發 shared `k8s-deploy` update job：

```text
REGISTRY_URL=asia-docker.pkg.dev/aile-infra/aile-services
IMAGE_NAME=aicardbff
TARGET_FOLDER=newaile/cardbff
```

Rules：

- branch `release` -> dev
- tags `qa-*` -> qa
- tags `uat-*` -> uat
- branch `main` 在看到的 CI 裡是 placeholder prod rule。

## Aicard 使用的 SpringCloud Backend Services

後端仍在 `springcloud-aile` microservices 裡。Aicard 不是呼叫全部 SpringCloud services；從 path families 看，主要是三個服務。

| SpringCloud service | Used for | Path evidence |
| --- | --- | --- |
| `aile-service-account` | OTP、login/logout、account item、mobile binding、scope lookup/check | `/account/*`, `/account/otp/*`, `/account/scope/*` |
| `aile-service-application` | Cards、relations、manual cards、notifications、user profile、Gemini OCR/analyze | `/application/card/*`, `/application/relation/*`, `/application/manualcard/*`, `/application/notification/*`, `/application/user/*`, `/application/gemini/*` |
| `aile-service-base` | Attachment/avatar/image upload/download/view URL | `/base/attachment/*` |

## 主要使用者流程

### Login / phone / scope auth

```text
aicard_app
  -> cardbff /graphql
    -> AuthDataSource
      -> /account/otp/v1/send
      -> /account/otp/v1/validate
      -> /account/v1/login
      -> /account/v1/login/success
      -> /account/v1/register
      -> /account/scope/v1/find/item
      -> /account/scope/v1/real/check
      -> /application/user/v1/exists/{scopeId}
```

### Card management

```text
aicard_app
  -> cardbff /graphql
    -> CardDataSource
      -> /application/card/v1/create
      -> /application/card/v1/update
      -> /application/card/v1/detail/{id}
      -> /application/card/v1/self/{id}
      -> /application/card/v1/list/self
      -> /application/card/v1/list/contacts
      -> /application/card/v1/search
      -> /application/card/v1/search/all
      -> /application/card/v1/delete/{id}
      -> /application/card/v1/check
      -> /application/card/v1/exist/{id}
      -> /application/card/v1/preview/{id}
```

### Card relations / collection

```text
aicard_app
  -> cardbff /graphql
    -> RelationDataSource / CardDataSource
      -> /application/relation/v1/collect/{id}
      -> /application/relation/v1/check/{cardId}
      -> /application/relation/v1/delete/{id}
      -> /application/relation/v1/detail/{id}
      -> /application/relation/v1/note/*
      -> /application/relation/v1/category/*
      -> /application/relation/v1/cardcollected/{cardId}
      -> /application/relation/v1/getCollectedCount/{cardId}
      -> /application/relation/v1/search
      -> /application/relation/v1/getContactCardCount
```

### Manual cards

```text
aicard_app
  -> cardbff /graphql
    -> ManualCardDataSource
      -> /application/manualcard/v1/create
      -> /application/manualcard/v1/update
      -> /application/manualcard/v1/detail/{id}
      -> /application/manualcard/v1/list/contacts
      -> /application/manualcard/v1/search
      -> /application/manualcard/v1/delete/{id}
```

### Notifications

```text
aicard_app
  -> cardbff /graphql
    -> NotificationDataSource
      -> /application/notification/v1/list
      -> /application/notification/v1/create
      -> /application/notification/v1/read/{id}
      -> /application/notification/v1/readall
      -> /application/notification/v1/delete/{id}
      -> /application/notification/v1/accept/{id}
      -> /application/notification/v1/ignore/{id}
      -> /application/notification/v1/unread/count
      -> /application/notification/v1/check/{cardId}
      -> /application/notification/v1/searchAllSend
      -> /application/notification/v1/update
      -> /application/notification/v1/getSendCount
```

### User profile

```text
aicard_app
  -> cardbff /graphql
    -> UserDataSource
      -> /application/user/v1/create
      -> /application/user/v1/update
      -> /application/user/v1/detail
      -> /application/user/v1/maincard/{id}
      -> /application/user/v1/mail/validate
      -> /application/user/v1/mail/verify
      -> /application/user/v1/find/{inviteCode}
      -> /application/user/v1/maincard/find/{phone}
      -> /application/user/v1/scan/count
```

### Avatar / attachment / OCR

```text
aicard_app
  -> direct REST through VITE_AILE_ATTACHMENT_BASE_URL
    -> /base/attachment/v2/avatar/upload
    -> /base/attachment/v1/download/view/url
    -> /base/attachment/v1/image/upload
    -> /base/attachment/v1/avatar/download
    -> /application/gemini/v1/analyze
```

這條 path 會繞過 GraphQL BFF，直接打 attachment/OCR endpoints。

### Points / goods / external UUPON

```text
aicard_app
  -> cardbff /graphql
    -> PointDataSource
      -> https://dev.uupon.com/admin/v2/user/point/detail
      -> https://dev.uupon.com/admin/v1/user/refresh/points
      -> https://dev.uupon.com/goods/v1/tenant/goods/list
      -> https://dev.uupon.com/activity/v1/user/activity/trigger
```

`BaseDataSource` 對 `uupon` URLs 與 BFF context 內的 `satoken` cookie headers 有特殊處理。

## 抽離 / 拆分影響

如果要把 Aicard backend 從 `springcloud-aile` 抽離，主要風險不在 Java compile dependency，而在 runtime/API compatibility：

- 保留 `/account/*`、`/application/*`、`/base/attachment/*` API contracts，或同步更新 BFF/frontend endpoints。
- 保留 BFF 的 `AILE_BASE_URL` 行為，或改成明確的 service base URLs。
- 保留 frontend direct `VITE_AILE_ATTACHMENT_BASE_URL` 行為，或把這些 endpoints 改走 BFF。
- 保留 auth headers 與 `satoken` handling。
- 保留 BFF 的 Secret Manager remoteRefs 與 K8s desired state。
- UUPON/dev.uupon.com external calls 需獨立驗證；它們不是 SpringCloud services。

## 證據命令

```bash
rg -n "VITE_BFF_GRAPHQL|VITE_AILE_ATTACHMENT_BASE_URL|AILE_ATTACHMENT|fetch\\(|axios|graphql" \
  /home/samlu/devops-repos/aicard_app/src

git -C /home/samlu/devops-repos/cardbff grep -n -E \
  "AILE_BASE_URL|RESTDataSource|/account|/application|/base|dev\\.uupon" \
  origin/release -- src

rg -n "image:|repository:|tag:|remoteRef|aicard|cardbff" \
  /home/samlu/devops-repos/k8s-deploy/newaile/cardbff
```

## Live 待驗證項目

- 本文件不證明 `cardbff` pods healthy，也不證明 Argo CD 已 sync desired state。
- SpringCloud routing ownership 是從 path families 與 local module layout 推斷；若要 deployment truth，需查 live gateway/service discovery。
- Secret values、Firebase tokens、WIF credential files、kubeconfigs 都沒有讀取。
