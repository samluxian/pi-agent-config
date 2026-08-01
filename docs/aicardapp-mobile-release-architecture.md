# AICardApp Web and Mobile Release Architecture

## 目的

這份文件整理 `aicardapp` 類型產品在 `dev`、`qa`、`uat`、`prod` 四個環境下的
前端、App、後端與發佈 pipeline 設計。

核心原則：

- Web 版本才是部署到 Firebase Hosting。
- App 版本不是部署到 GKE 或 Firebase Hosting，而是打包成不同環境設定的 build。
- `dev`、`qa`、`uat` App build 透過測試發佈通道給內部人員安裝。
- `prod` App build 才進 Google Play / App Store 正式發佈流程。
- 各環境 App / Web 都應固定連到同環境的 GKE backend。

## 整體架構

```text
Web:
dev  -> Firebase Hosting dev  -> dev GKE backend
qa   -> Firebase Hosting qa   -> qa GKE backend
uat  -> Firebase Hosting uat  -> uat GKE backend
prod -> Firebase Hosting prod -> prod GKE backend

Mobile App:
dev  -> internal build distribution -> dev GKE backend
qa   -> QA build distribution       -> qa GKE backend
uat  -> TestFlight / Play testing   -> uat GKE backend
prod -> Google Play / App Store     -> prod GKE backend
```

如果產品同時有 Web 與 App，Firebase Hosting 只負責 Web。App 的發佈應透過
Android / iOS 原生平台的 build、signing、測試發佈與商店審核流程。

## 環境切分

建議每個環境維持獨立 backend 與公開 endpoint：

| Env | Web frontend | App distribution | Backend |
| --- | --- | --- | --- |
| `dev` | Firebase Hosting dev site | CI artifact / Firebase App Distribution | dev GKE |
| `qa` | Firebase Hosting qa site | CI artifact / Firebase App Distribution | qa GKE |
| `uat` | Firebase Hosting uat site | TestFlight / Google Play internal 或 closed track | uat GKE |
| `prod` | Firebase Hosting prod site | Google Play production / App Store production | prod GKE |

App build 應該在 build time 固定 API endpoint，例如：

```text
aicardapp-dev  -> https://api-dev.example.com
aicardapp-qa   -> https://api-qa.example.com
aicardapp-uat  -> https://api-uat.example.com
aicardapp-prod -> https://api.example.com
```

不建議讓正式上架 App 對一般使用者提供切換 `dev`、`qa`、`uat` backend 的入口。

## Pipeline 分層

建議把 pipeline 拆成四層：

```text
validate -> build/package -> archive -> distribute/release
```

### Validate

用於所有 branch / MR：

- lint
- unit test
- type check
- basic build check

### Build / Package

依環境打包：

```text
Web:
npm build dev/qa/uat/prod

Android:
assembleDev / assembleQa / assembleUat / bundleProd

iOS:
archive dev / qa / uat / prod scheme
```

Android 給 QA 直接安裝時，應產出 `.apk`。`aab` 主要用於 Google Play，不適合作為
QA 直接安裝檔。

iOS 給 QA 測試時，優先走 TestFlight。直接下載 `.ipa` 安裝需要 Ad Hoc signing 與
裝置 UDID 管理，維運成本較高。

### Archive

每次可測 build 都應保存執行檔與 metadata，方便 QA 下載、回溯與問題追查。

建議保存位置：

```text
GitLab CI artifacts:
  短期保存，適合工程與 QA 快速下載。

GCS bucket:
  中長期保存，適合保留指定版本、commit 與 release candidate。

Firebase App Distribution:
  Android QA 的主要安裝入口。

TestFlight:
  iOS QA / UAT 的主要安裝入口。
```

範例 GCS 結構：

```text
gs://aicardapp-mobile-builds/
  dev/
    android/aicardapp-dev-1.2.3-128.apk
    ios/aicardapp-dev-1.2.3-128.ipa
  qa/
    android/aicardapp-qa-1.2.3-128.apk
    ios/aicardapp-qa-1.2.3-128.ipa
  uat/
    android/aicardapp-uat-1.2.3-128.apk
    ios/aicardapp-uat-1.2.3-128.ipa
  prod/
    android/aicardapp-prod-1.2.3-128.aab
    ios/aicardapp-prod-1.2.3-128.ipa
```

建議每個 build 一起保存 metadata：

```json
{
  "app": "aicardapp",
  "env": "qa",
  "version": "1.2.3",
  "buildNumber": 128,
  "commit": "abc1234",
  "apiBaseUrl": "https://api-qa.example.com",
  "builtAt": "2026-06-05T10:00:00Z"
}
```

metadata 不應包含 secret、token、private key、keystore password、App Store key
content 或任何 credential value。

### GCS APK 下載方式

`GCS bucket` 可以保存 Android APK，讓 QA 在需要時下載特定版本。這裡的 GCS 指
Google Cloud Storage，不是 GKE。

範例 APK 路徑：

```text
gs://aicardapp-mobile-builds/qa/android/aicardapp-qa-1.2.3-128-abc1234.apk
```

建議不要把 bucket 設成 public。比較安全的做法是由 CI 在 APK 上傳後產生
短效 signed URL，並把連結輸出到 CI job log 或發到 QA 通知管道。

範例：

```bash
gcloud storage sign-url \
  gs://aicardapp-mobile-builds/qa/android/aicardapp-qa-1.2.3-128-abc1234.apk \
  --duration=7d
```

QA 拿到 signed URL 後，可以直接用瀏覽器下載 APK，再安裝到 Android 實體機或
模擬器。

如果 QA 團隊有 GCP IAM 權限，也可以直接用 `gcloud` 下載：

```bash
gcloud storage cp \
  gs://aicardapp-mobile-builds/qa/android/aicardapp-qa-1.2.3-128-abc1234.apk \
  .
```

下載後安裝：

```bash
adb install aicardapp-qa-1.2.3-128-abc1234.apk
```

建議權限模型：

```text
GCS bucket:
  不開 public access。

CI service account:
  可以 upload APK。
  可以產生 signed URL。

QA group:
  若使用 signed URL，不需要 GCP IAM 權限。
  若直接用 gcloud 下載，授予 Storage Object Viewer。
```

建議 CI job 流程：

```text
build QA APK
  -> upload APK to GCS
  -> generate signed URL
  -> print signed URL in CI job log
  -> optional: send URL to Slack / Teams / QA release channel
```

官方依據與注意事項：

- Google Cloud Storage signed URL 是對特定 Cloud Storage resource 提供限時存取。
- 持有 signed URL 的人，在 URL 有效期間可以使用該 URL 存取 object。
- QA 使用 signed URL 下載時，不需要 Google 帳號或 GCP credentials。
- 產生 signed URL 的 service account 必須有足夠權限執行該 request。
- `gcloud storage sign-url` 是 Google Cloud CLI 官方提供的 signed URL 產生指令。
- V4 signed URL 最長有效期是 604800 秒，也就是 7 天。
- signed URL 是 bearer link；有效期間內，任何拿到連結的人都能下載，不應貼到公開頻道。

參考文件：

- Google Cloud Storage Signed URLs:
  <https://docs.cloud.google.com/storage/docs/access-control/signed-urls>
- Google Cloud Storage access control overview:
  <https://cloud.google.com/storage/docs/access-control/>
- `gcloud storage sign-url` command reference:
  <https://docs.cloud.google.com/sdk/gcloud/reference/storage/sign-url>

### Distribute / Release

非 prod：

```text
dev -> internal artifact 或 Firebase App Distribution
qa  -> Firebase App Distribution / QA tester group
uat -> TestFlight / Google Play internal 或 closed track
```

prod：

```text
Android:
build signed AAB -> upload Google Play -> staged rollout -> manual promote

iOS:
build signed IPA -> upload App Store Connect -> TestFlight/App Review -> manual release
```

`prod` 不建議在 merge 後直接全自動正式上架。建議至少保留人工核准點：

```text
build prod app -> upload store -> review/check -> manual release/promote
```

## 版本與命名

建議使用單一版本來源：

```text
versionName / marketing version: 1.2.3
buildNumber / versionCode: 128
```

對應平台：

| Platform | Version | Build number |
| --- | --- | --- |
| Android | `versionName` | `versionCode`，必須單調遞增 |
| iOS | `CFBundleShortVersionString` | `CFBundleVersion`，必須單調遞增 |

建議 artifact 命名格式：

```text
aicardapp-<env>-<version>-<buildNumber>-<shortCommit>.<ext>
```

例如：

```text
aicardapp-qa-1.2.3-128-abc1234.apk
aicardapp-uat-1.2.3-128-abc1234.ipa
aicardapp-prod-1.2.3-128-abc1234.aab
```

## QA 安裝方式

Android：

```text
首選：Firebase App Distribution
備用：下載 CI artifact / GCS APK 後 adb install
```

範例：

```bash
adb install aicardapp-qa-1.2.3-128-abc1234.apk
```

iOS：

```text
首選：TestFlight
備用：Ad Hoc IPA，但需要管理 QA 裝置 UDID 與 provisioning profile
```

因此 QA 要能「拉下來直接裝」時，Android 可用 APK 滿足；iOS 則應以 TestFlight
作為主要流程，不應假設 `.ipa` 下載後就能任意安裝到實體機。

## Secrets and Signing

以下資料必須由 CI secret store、Vault、Secret Manager 或 protected variables 管理，
不可進 Git：

- Android keystore
- keystore password
- key alias / key password
- Google Play service account JSON
- Apple App Store Connect API key
- Apple signing certificate
- provisioning profile
- Firebase service account credential

repo 裡可以保存的是：

- build script
- Fastlane lane
- environment name
- non-secret API base URL
- artifact naming rule
- release notes template
- metadata schema

## 建議 Pipeline 觸發策略

```text
MR:
  validate only

develop:
  deploy web dev
  build app dev
  archive artifact

qa branch 或 qa tag:
  deploy web qa
  build app qa
  archive artifact
  distribute to QA

uat branch 或 release candidate tag:
  deploy web uat
  build app uat
  archive artifact
  distribute to UAT / TestFlight / Play testing

release tag vX.Y.Z:
  deploy web prod
  build app prod
  archive artifact
  upload to Google Play / App Store Connect
  wait for manual approval / review
```

## 最小落地順序

建議分階段導入：

1. 先完成 Web dev/qa/uat/prod 到 Firebase Hosting，確認各自連對 GKE backend。
2. Android 先產出 dev/qa/uat APK，保存到 CI artifact 或 GCS，讓 QA 可下載安裝。
3. Android 接 Firebase App Distribution，建立 QA tester group。
4. iOS 建立 macOS runner、signing、TestFlight internal testing。
5. 建立 prod release tag 流程，但 production store release 保留 manual approval。
6. 補上 artifact metadata、保存期限、release notes 與版本號規則。

## 決策摘要

```text
Firebase Hosting:
  負責 Web 版本部署。

GKE:
  負責 backend，各環境獨立。

Android dev/qa/uat:
  產 APK，給 QA 下載或透過 Firebase App Distribution 安裝。

iOS dev/qa/uat:
  產 IPA，但主要透過 TestFlight 安裝。

prod mobile:
  Android 上 Google Play。
  iOS 上 App Store。

prod web:
  仍部署到 Firebase Hosting prod。
```
