# GitOps Service Delivery

這個 skill 把服務的 repository values、application config、bootstrap discovery 與 Helm render
放進同一個可 review 的交付流程。Agent 執行 contract 位於 [`SKILL.md`](SKILL.md)。

## 支援的 adapter

目前只支援 `k8s-deploy` 的 `flex-app` service layout。通用名稱不代表可以套用到任意 GitOps
repository；其他 layout 必須先定義 ownership、discovery、render 與 validation adapter。

## 何時使用

- 修改 service `values.yaml` 或 `values.<env>.yaml`。
- 修改 `app-config/values.<env>-<config-name>.yaml`。
- 調整 service discovery、value-file order 或環境 render。
- 檢查 flex-app wrapper 的 service-owned configuration。

## 不適用

- 修改 shared chart API；請使用 `shared-helm-chart-maintenance`。
- 升級 chart dependency；請使用 `helm-dependency-upgrade`。
- 修改 bootstrap/platform component；請使用 `kubernetes-platform-delivery`。
- 其他 GitOps layout。

## 怎麼運作

1. 確認 repository、branch、working tree、service、environment 與 pinned chart version。
2. 讀 service files、bootstrap value order、chart defaults/schema 與 CI image-tag path。
3. 將每個 value 分類成 baseline、environment override、application config、secret reference
   或 unsupported value。
4. 提出精確檔案、ownership、validation、migration impact 與風險。
5. 只修改已批准檔案，保留 disabled environment 的 ignore layout。
6. 驗證 dependency artifacts、discovery、effective values 與每個受影響環境的 render。

## 重要邊界

Authserver 只能作為結構參考，不能提供其他服務的 identity、endpoint、secret reference、
resources、probe、image 或環境啟用值。Secret-backed settings 只保存 reference，不讀取
secret value。

## 入口

- [`references/flex-app-service-config-contract.md`](references/flex-app-service-config-contract.md)：
  file layout、values ownership 與 validation contract。
- [`references/helm-alias-overlays.md`](references/helm-alias-overlays.md)：`stable`、`beta` 等 aliases。
- [`scripts/check_service_config_contract.py`](scripts/check_service_config_contract.py)：contract validator。
- [`scripts/implementation_flow.sh`](scripts/implementation_flow.sh)：preflight、overlay、render 與 post-patch checks。
- [`scripts/post_patch_review.sh`](scripts/post_patch_review.sh)：bounded final diff review helper。

## 輸出

輸出包含實際修改、contract/discovery/render validation、風險、commit message 建議與一個
使用者操作。Live deployment 仍交由既有 GitOps 流程完成。
