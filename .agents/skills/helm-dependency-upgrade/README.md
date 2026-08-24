# Helm Dependency Upgrade

這個 skill 比較 service wrapper 的 current 與 target Helm dependency，將 release notes、精確
chart source、wrapper configuration 與 render evidence 放在一起評估。Agent contract 位於
[`SKILL.md`](SKILL.md)。

## 支援的 adapter

目前只支援 wrappers 升級 pinned shared application-chart dependency。其他 chart 或 wrapper
必須先建立 release、ownership、render 與 compatibility adapter。

## 何時使用

- 評估 application chart version upgrade。
- 比較升級前後 selectors、labels、affinity、KSA/GSA、Service、PDB、HPA 或 KEDA。
- 從一段 release interval 建立 migration plan。
- 確認 wrapper values 與新 chart defaults 是否相容。

## 不適用

- 修改 shared chart source；請使用 `shared-helm-chart-maintenance`。
- 無關的 package/dependency upgrade。
- 缺少 current/target version 或 exact released source 的推測性比較。

## 怎麼運作

1. 固定 wrapper、service/environment、current/target version 與 assessment/edit scope。
2. 讀完整 upgrade interval 的 release notes。
3. 取得 current 與 target 的 exact released chart source；不用 `main` 代替 tag。
4. 檢查 wrapper metadata、aliases、values、app-of-apps 與 CI handoff。
5. Render current/target effective values 並產生 bounded summaries。
6. 比較 resource presence 與 spec-level fields。
7. 對照 release claims、source、renders 與獲准的 read-only live evidence。
8. 產生 migration plan，將實作交給 `gitops-service-delivery`。

## 入口

- [`references/version-ownership-matrix.md`](references/version-ownership-matrix.md)：wrapper、chart、
  bootstrap 與 live ownership。
- [`scripts/render_chart_upgrade_summary.sh`](scripts/render_chart_upgrade_summary.sh)：current/target render summary。
- [`scripts/tests/render_chart_upgrade_summary_test.sh`](scripts/tests/render_chart_upgrade_summary_test.sh)：renderer regression fixture。

## 停止條件

缺少 release note、exact chart source、明確版本、render ownership 或必要 live authorization 時
停止。Release note 與實際 source/render 衝突時，直接列出衝突，不替任一方補合理化解釋。

## 輸出

輸出包含 upgrade scope、必要變更與 evidence、compatibility、validation gaps、deployment/runtime
risk 與下一步。
